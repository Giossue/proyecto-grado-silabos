<?php

namespace App\Modules\AiAssistance\Infrastructure\Gateways;

use App\Modules\AiAssistance\Domain\Contracts\AiAnalysisGateway;
use App\Modules\AiAssistance\Domain\Data\AiAnalysisInput;
use App\Modules\AiAssistance\Domain\Data\AiAnalysisResult;
use App\Modules\AiAssistance\Domain\Data\AiRecommendationOutput;
use App\Modules\AiAssistance\Domain\Exceptions\AiContractException;
use App\Modules\AiAssistance\Domain\Exceptions\AiGatewayUnavailable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Throwable;

class HttpAiAnalysisGateway implements AiAnalysisGateway
{
    public function version(): string
    {
        return (string) config('ai.http.expected_version');
    }

    public function analyze(AiAnalysisInput $input): AiAnalysisResult
    {
        $url = (string) config('ai.http.url');
        $this->assertLoopbackUrl($url);

        try {
            $response = Http::acceptJson()
                ->asJson()
                ->withoutRedirecting()
                ->connectTimeout((int) config('ai.http.connect_timeout_seconds'))
                ->timeout((int) config('ai.http.timeout_seconds'))
                ->post($url, $input->toGatewayPayload());
        } catch (ConnectionException $exception) {
            throw new AiGatewayUnavailable('El servicio local de IA no está disponible.', previous: $exception);
        } catch (Throwable $exception) {
            throw new AiGatewayUnavailable('No fue posible contactar el servicio local de IA.', previous: $exception);
        }

        if (! $response->successful()) {
            throw new AiGatewayUnavailable('El servicio local de IA respondió con un error temporal.');
        }
        if (strlen($response->body()) > (int) config('ai.limits.response_bytes')) {
            throw new AiContractException('La respuesta excede el tamaño permitido.');
        }
        $payload = $response->json();
        if (! is_array($payload) || array_is_list($payload)) {
            throw new AiContractException('La respuesta no contiene un objeto JSON válido.');
        }
        $this->rejectAcademicActions($payload);

        return $this->hydrateResult($payload);
    }

    /** @param array<string, mixed> $payload */
    private function hydrateResult(array $payload): AiAnalysisResult
    {
        $requestId = $payload['request_id'] ?? null;
        $status = $payload['status'] ?? null;
        $gatewayVersion = $payload['gateway_version'] ?? null;
        $reason = $payload['inconclusive_reason'] ?? null;
        $items = $payload['recommendations'] ?? null;
        if (! is_string($requestId) || ! is_string($status) || ! is_string($gatewayVersion)
            || ! is_array($items) || ($reason !== null && ! is_string($reason))) {
            throw new AiContractException('Faltan campos obligatorios en la respuesta.');
        }

        $recommendations = [];
        foreach ($items as $item) {
            if (! is_array($item) || array_is_list($item)) {
                throw new AiContractException('Una recomendación tiene una estructura inválida.');
            }
            $type = $item['type'] ?? null;
            $title = $item['title'] ?? null;
            $explanation = $item['explanation'] ?? null;
            $suggestedText = $item['suggested_text'] ?? null;
            $evidenceIds = $item['evidence_ids'] ?? null;
            if (! is_string($type) || ! is_string($title) || ! is_string($explanation)
                || ! is_string($suggestedText) || ! is_array($evidenceIds)) {
                throw new AiContractException('Una recomendación omite datos obligatorios.');
            }
            $normalizedEvidenceIds = [];
            foreach ($evidenceIds as $evidenceId) {
                if (! is_string($evidenceId)) {
                    throw new AiContractException('Una referencia de evidencia es inválida.');
                }
                $normalizedEvidenceIds[] = $evidenceId;
            }
            $recommendations[] = new AiRecommendationOutput(
                $type,
                $title,
                $explanation,
                $suggestedText,
                array_values(array_unique($normalizedEvidenceIds)),
            );
        }

        return new AiAnalysisResult(
            $requestId,
            $status,
            $gatewayVersion,
            $recommendations,
            $reason,
        );
    }

    /** @param array<string, mixed> $payload */
    private function rejectAcademicActions(array $payload): void
    {
        $forbidden = ['action', 'actions', 'approve', 'approved', 'block', 'decision', 'grade', 'score', 'state', 'status_change', 'tool_calls'];
        $walk = function (array $value) use (&$walk, $forbidden): void {
            foreach ($value as $key => $item) {
                if (is_string($key) && in_array(strtolower($key), $forbidden, true)) {
                    throw new AiContractException('La respuesta intentó incluir una decisión o acción académica.');
                }
                if (is_array($item)) {
                    $walk($item);
                }
            }
        };
        $walk($payload);
    }

    private function assertLoopbackUrl(string $url): void
    {
        $parts = parse_url($url);
        if ($parts === false) {
            throw new AiGatewayUnavailable('La configuración de IA debe apuntar a un servicio HTTP local.');
        }
        $host = $parts['host'] ?? null;
        $scheme = $parts['scheme'] ?? null;
        $host = is_string($host) ? trim(strtolower($host), '[]') : null;
        if ($scheme !== 'http' || ! in_array($host, ['localhost', '127.0.0.1', '::1'], true)
            || isset($parts['user']) || isset($parts['pass'])) {
            throw new AiGatewayUnavailable('La configuración de IA debe apuntar a un servicio HTTP local.');
        }
    }
}
