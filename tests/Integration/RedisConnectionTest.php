<?php

namespace Tests\Integration;

use Illuminate\Support\Facades\Redis;
use Tests\TestCase;

class RedisConnectionTest extends TestCase
{
    public function test_redis_is_discardable_coordination_not_business_storage(): void
    {
        $key = 'silabos:integration:'.str()->uuid();

        Redis::setex($key, 30, 'ok');

        $this->assertSame('ok', Redis::get($key));
        $this->assertSame(1, Redis::del($key));
    }
}
