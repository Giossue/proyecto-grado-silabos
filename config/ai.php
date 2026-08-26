<?php

return [
    'driver' => env('AI_DRIVER', 'disabled'),
    'contract_version' => 'ai-analysis-v1',
    'instruction_version' => 'ueb-editorial-v1',
    'http' => [
        'url' => env('AI_LOCAL_URL', 'http://127.0.0.1:8081/v1/analyze'),
        'expected_version' => env('AI_LOCAL_VERSION', 'local-http-v1'),
        'connect_timeout_seconds' => (int) env('AI_CONNECT_TIMEOUT', 2),
        'timeout_seconds' => (int) env('AI_TIMEOUT', 20),
    ],
    'limits' => [
        'input_characters' => 50000,
        'evidence_items' => 50,
        'evidence_excerpt_characters' => 12000,
        'recommendations' => 5,
        'explanation_characters' => 4000,
        'suggested_text_characters' => 50000,
        'response_bytes' => 262144,
        'requests_per_minute' => 6,
    ],
];
