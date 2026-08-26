<?php

return [
    'institutional_import' => [
        'driver' => env('INSTITUTIONAL_IMPORT_DRIVER', 'disabled'),
        'contract_version' => 'institutional-import-v2',
        'limits' => [
            'records_per_batch' => 1000,
            'record_bytes' => 32768,
            'batch_bytes' => 2097152,
            'requests_per_minute' => 3,
        ],
    ],
];
