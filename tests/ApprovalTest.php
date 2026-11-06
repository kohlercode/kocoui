<?php
declare(strict_types=1);

use KocoUI\Approval;

return static function (): void {
    TestCase::assertSame(
        ['choice' => 'once'],
        Approval::hermesBody('once', '', null),
        'legacy choice only',
    );
    TestCase::assertSame(
        ['choice' => 'deny', 'request_id' => 'req_1'],
        Approval::hermesBody('deny', 'req_1', null),
        'legacy with request_id',
    );
    TestCase::assertSame(
        ['request_id' => 'p1', 'execution_generation' => 3, 'choice' => 'once'],
        Approval::hermesBody('once', 'p1', 3),
        'canonical exact keys',
    );

    $card = Approval::fromHermesStatus([
        'status' => 'waiting_for_approval',
        'execution_generation' => 4,
        'pending_controls' => [
            ['kind' => 'clarify', 'prompt_id' => 'c1'],
            [
                'kind' => 'approval',
                'prompt_id' => 'appr_9',
                'command' => 'ls',
                'description' => 'list',
                'choices' => ['once', 'deny'],
                'url' => 'https://secret.example',
            ],
        ],
    ]);
    TestCase::assertSame('appr_9', $card['request_id'] ?? null, 'prompt_id becomes request_id');
    TestCase::assertSame(4, $card['execution_generation'] ?? null, 'generation from run');
    TestCase::assertSame(['once', 'deny'], $card['choices'] ?? null, 'choices');
    TestCase::assertTrue(!isset($card['url']), 'drops extra keys');

    TestCase::assertNull(Approval::fromHermesStatus(['status' => 'running']), 'no card while running');
    TestCase::assertSame(
        'req_old',
        Approval::fromHermesStatus(['status' => 'waiting_for_approval', 'approval' => ['request_id' => 'req_old']])['request_id'] ?? null,
        'legacy approval object',
    );
};
