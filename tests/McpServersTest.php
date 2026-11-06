<?php
declare(strict_types=1);

use KocoUI\McpServers;

return static function (): void {
    $clean = McpServers::sanitize([
        'name' => 'awork',
        'state' => 'connected',
        'transport' => 'streamable_http',
        'tool_count' => 4,
        'url' => 'https://secret.example/mcp',
        'command' => 'npx',
        'args' => ['-y', '@evil/mcp'],
        'headers' => ['Authorization' => 'Bearer secret'],
        'env' => ['TOKEN' => 'secret'],
        'error' => 'Connection refused at https://secret.example/mcp',
    ]);
    TestCase::assertSame(
        ['name' => 'awork', 'state' => 'connected', 'transport' => 'streamable_http', 'tool_count' => 4],
        $clean,
        'drops credentials and urls',
    );

    TestCase::assertNull(McpServers::sanitize(['name' => '../etc/passwd', 'state' => 'connected']), 'bad name');
    TestCase::assertSame('unknown', McpServers::sanitize(['name' => 'x', 'state' => 'exploded'])['state'] ?? null, 'unknown state');
    TestCase::assertSame('', McpServers::sanitize(['name' => 'x', 'transport' => 'unix'])['transport'] ?? 'missing', 'unknown transport');

    $fromSets = McpServers::fromToolsets([
        'data' => [
            ['name' => 'files', 'enabled' => true, 'tools' => ['read_file']],
            ['name' => 'mcp-github', 'enabled' => true, 'tools' => ['mcp_github_list_issues', ['nope']]],
            ['name' => 'mcp_linear', 'enabled' => false, 'tools' => ['find_issues']],
        ],
    ]);
    TestCase::assertSame(2, count($fromSets), 'only mcp toolsets');
    TestCase::assertSame('github', $fromSets[0]['name'], 'mcp- prefix');
    TestCase::assertSame('connected', $fromSets[0]['state'], 'enabled toolset');
    TestCase::assertSame(['mcp_github_list_issues'], $fromSets[0]['tools'] ?? [], 'string tools only');
    TestCase::assertSame('linear', $fromSets[1]['name'], 'mcp_ prefix');
    TestCase::assertSame('disabled', $fromSets[1]['state'], 'disabled toolset');

    $merged = McpServers::withTools(
        [['name' => 'github', 'state' => 'connected', 'transport' => 'stdio', 'tool_count' => 1]],
        $fromSets,
    );
    TestCase::assertSame(['mcp_github_list_issues'], $merged[0]['tools'] ?? [], 'attach tool names');
};
