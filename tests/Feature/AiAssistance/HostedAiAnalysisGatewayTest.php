<?php

namespace Tests\Feature\AiAssistance;

use App\Modules\AiAssistance\Application\AiResultContract;
use App\Modules\AiAssistance\Domain\Contracts\AiAnalysisGateway;
use App\Modules\AiAssistance\Domain\Data\AiAnalysisInput;
use App\Modules\AiAssistance\Domain\Data\AiEvidenceInput;
use App\Modules\AiAssistance\Domain\Exceptions\AiGatewayUnavailable;
use App\Modules\AiAssistance\Infrastructure\Gateways\HostedAiAnalysisGateway;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class HostedAiAnalysisGatewayTest extends TestCase
{
    public function test_openai_uses_responses_with_structured_output_and_no_reasoning_options(): void
    {
        $this->configure('openai', 'https://api.openai.com/v1', 'gpt-test');
        Http::fake([
            'https://api.openai.com/v1/responses' => Http::response([
                'output_text' => $this->completedOutput(),
            ]),
        ]);

        $result = app(AiAnalysisGateway::class)->analyze($this->input());

        $this->assertInstanceOf(HostedAiAnalysisGateway::class, app(AiAnalysisGateway::class));
        $this->assertSame('openai:gpt-test', $result->gatewayVersion);
        app(AiResultContract::class)->validate($this->input($result->requestId), $result);
        Http::assertSent(function (Request $request): bool {
            $data = $request->data();

            return $request->url() === 'https://api.openai.com/v1/responses'
                && $request->hasHeader('Authorization', 'Bearer secret-test-key')
                && $data['model'] === 'gpt-test'
                && $data['store'] === false
                && data_get($data, 'text.format.type') === 'json_schema'
                && ! array_key_exists('reasoning', $data);
        });
    }

    public function test_claude_uses_messages_and_accepts_a_full_endpoint_url(): void
    {
        $this->configure('claude', 'https://api.anthropic.com/v1/messages', 'claude-test');
        Http::fake([
            'https://api.anthropic.com/v1/messages' => Http::response([
                'content' => [['type' => 'text', 'text' => $this->completedOutput()]],
            ]),
        ]);

        $result = (new HostedAiAnalysisGateway)->analyze($this->input());

        $this->assertSame('claude:claude-test', $result->gatewayVersion);
        Http::assertSent(function (Request $request): bool {
            $data = $request->data();

            return $request->url() === 'https://api.anthropic.com/v1/messages'
                && $request->hasHeader('x-api-key', 'secret-test-key')
                && $request->hasHeader('anthropic-version', '2023-06-01')
                && data_get($data, 'output_config.format.type') === 'json_schema'
                && ! array_key_exists('thinking', $data)
                && ! array_key_exists('effort', data_get($data, 'output_config', []));
        });
    }

    public function test_anthropic_is_an_alias_for_claude(): void
    {
        $this->configure('anthropic', 'https://api.anthropic.com/v1', 'claude-test');
        Http::fake([
            'https://api.anthropic.com/v1/messages' => Http::response([
                'content' => [['type' => 'text', 'text' => $this->completedOutput()]],
            ]),
        ]);

        $result = app(AiAnalysisGateway::class)->analyze($this->input());

        $this->assertSame('claude:claude-test', $result->gatewayVersion);
    }

    public function test_deepseek_uses_json_output_and_disables_thinking_explicitly(): void
    {
        $this->configure('deepseek', 'https://api.deepseek.com', 'deepseek-test');
        Http::fake([
            'https://api.deepseek.com/chat/completions' => Http::response([
                'choices' => [['message' => ['content' => $this->completedOutput()]]],
            ]),
        ]);

        $result = (new HostedAiAnalysisGateway)->analyze($this->input());

        $this->assertSame('deepseek:deepseek-test', $result->gatewayVersion);
        Http::assertSent(function (Request $request): bool {
            $data = $request->data();

            return $request->url() === 'https://api.deepseek.com/chat/completions'
                && $request->hasHeader('Authorization', 'Bearer secret-test-key')
                && data_get($data, 'response_format.type') === 'json_object'
                && data_get($data, 'thinking.type') === 'disabled';
        });
    }

    public function test_hosted_provider_rejects_insecure_or_incomplete_configuration_without_sending(): void
    {
        Http::fake();
        $this->configure('openai', 'http://api.openai.com/v1', 'gpt-test');

        try {
            (new HostedAiAnalysisGateway)->analyze($this->input());
            $this->fail('El gateway aceptó una URL sin HTTPS.');
        } catch (AiGatewayUnavailable $exception) {
            $this->assertStringNotContainsString('secret-test-key', $exception->getMessage());
        }

        config(['ai.hosted.base_url' => 'https://api.openai.com/v1', 'ai.hosted.api_key' => '']);
        try {
            (new HostedAiAnalysisGateway)->analyze($this->input());
            $this->fail('El gateway aceptó una configuración sin clave.');
        } catch (AiGatewayUnavailable $exception) {
            $this->assertStringNotContainsString('secret-test-key', $exception->getMessage());
        }

        Http::assertNothingSent();
    }

    public function test_provider_error_does_not_expose_key_or_response_body(): void
    {
        $this->configure('openai', 'https://api.openai.com/v1', 'gpt-test');
        Http::fake([
            '*' => Http::response(['error' => ['message' => 'secret-test-key rejected']], 401),
        ]);

        try {
            (new HostedAiAnalysisGateway)->analyze($this->input());
            $this->fail('El gateway debía degradar el error remoto.');
        } catch (AiGatewayUnavailable $exception) {
            $this->assertStringNotContainsString('secret-test-key', $exception->getMessage());
            $this->assertStringNotContainsString('rejected', $exception->getMessage());
        }
    }

    private function configure(string $driver, string $baseUrl, string $model): void
    {
        config([
            'ai.driver' => $driver,
            'ai.hosted.base_url' => $baseUrl,
            'ai.hosted.model' => $model,
            'ai.hosted.api_key' => 'secret-test-key',
        ]);
    }

    private function input(?string $requestId = null): AiAnalysisInput
    {
        return new AiAnalysisInput(
            $requestId ?? (string) Str::uuid(),
            'ai-analysis-v1',
            'ueb-editorial-v1',
            'objetivo_general',
            'Objetivo general',
            'Comprender los fundamentos.',
            hash('sha256', 'Comprender los fundamentos.'),
            'es-EC',
            [new AiEvidenceInput('evidence-1', 'source-1', 'Reglamento', 'Debe ser verificable.', hash('sha256', 'evidence'))],
            5,
        );
    }

    private function completedOutput(): string
    {
        return json_encode([
            'status' => 'completed',
            'inconclusive_reason' => null,
            'recommendations' => [[
                'type' => 'clarity',
                'title' => 'Use un verbo observable',
                'explanation' => 'La fuente exige un resultado verificable.',
                'suggested_text' => 'Explicar los fundamentos mediante un caso aplicado.',
                'evidence_ids' => ['evidence-1'],
            ]],
        ], JSON_THROW_ON_ERROR);
    }
}
