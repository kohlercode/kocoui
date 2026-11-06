<?php
declare(strict_types=1);

namespace KocoUI;

/**
 * Sanitized MCP server rows for the UI. Never copies URLs, commands, headers,
 * env, or other config from Hermes.
 */
final class McpServers
{
    private const NAME = '/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/';
    private const TOOL = '/^[A-Za-z0-9._-]{1,128}$/';
    private const STATES = ['connected', 'connecting', 'failed', 'disabled', 'unknown', 'lazy'];
    private const TRANSPORTS = ['stdio', 'streamable_http', 'sse', 'http'];

    /** @return list<array{name:string,state:string,transport:string,tool_count:int,tools?:list<string>}> */
    public static function fromHermes(array $payload): array
    {
        $rows = $payload['data'] ?? $payload['servers'] ?? [];
        $out = [];
        foreach (is_array($rows) ? $rows : [] as $row) {
            $one = self::sanitize($row);
            if ($one !== null) {
                $out[] = $one;
            }
        }
        return $out;
    }

    /** @return list<array{name:string,state:string,transport:string,tool_count:int,tools?:list<string>}> */
    public static function fromToolsets(array $payload): array
    {
        $out = [];
        foreach ($payload['data'] ?? [] as $t) {
            if (!is_array($t)) {
                continue;
            }
            $server = self::serverNameFromToolset((string) ($t['name'] ?? ''));
            if ($server === null) {
                continue;
            }
            $tools = self::toolNames($t['tools'] ?? []);
            $row = [
                'name' => $server,
                'state' => !empty($t['enabled']) ? 'connected' : 'disabled',
                'transport' => '',
                'tool_count' => count($tools),
            ];
            if ($tools) {
                $row['tools'] = $tools;
            }
            $out[] = $row;
        }
        return $out;
    }

    /**
     * Copy tool names from toolset-derived rows onto live status rows of the same name.
     *
     * @param list<array{name:string,state:string,transport:string,tool_count:int,tools?:list<string>}> $live
     * @param list<array{name:string,state:string,transport:string,tool_count:int,tools?:list<string>}> $fromToolsets
     * @return list<array{name:string,state:string,transport:string,tool_count:int,tools?:list<string>}>
     */
    public static function withTools(array $live, array $fromToolsets): array
    {
        $tools = [];
        foreach ($fromToolsets as $row) {
            if (!empty($row['tools'])) {
                $tools[$row['name']] = $row['tools'];
            }
        }
        foreach ($live as $i => $row) {
            if (!empty($row['tools']) || empty($tools[$row['name']])) {
                continue;
            }
            $live[$i]['tools'] = $tools[$row['name']];
            if ($live[$i]['tool_count'] === 0) {
                $live[$i]['tool_count'] = count($tools[$row['name']]);
            }
        }
        return $live;
    }

    public static function sanitize(mixed $row): ?array
    {
        if (!is_array($row)) {
            return null;
        }
        $name = (string) ($row['name'] ?? '');
        if (preg_match(self::NAME, $name) !== 1) {
            return null;
        }
        $state = (string) ($row['state'] ?? '');
        if (!in_array($state, self::STATES, true)) {
            $state = array_key_exists('enabled', $row)
                ? (!empty($row['enabled']) ? 'connected' : 'disabled')
                : 'unknown';
        }
        $transport = strtolower(str_replace('-', '_', (string) ($row['transport'] ?? '')));
        if (!in_array($transport, self::TRANSPORTS, true)) {
            $transport = '';
        }
        $tools = self::toolNames($row['tools'] ?? []);
        $count = (int) ($row['tool_count'] ?? 0);
        if ($count < 0) {
            $count = 0;
        }
        if ($tools && $count === 0) {
            $count = count($tools);
        }
        $out = [
            'name' => $name,
            'state' => $state,
            'transport' => $transport,
            'tool_count' => $count,
        ];
        if ($tools) {
            $out['tools'] = $tools;
        }
        return $out;
    }

    private static function serverNameFromToolset(string $name): ?string
    {
        foreach (['mcp-', 'mcp_'] as $prefix) {
            if (str_starts_with($name, $prefix)) {
                $rest = substr($name, strlen($prefix));
                return preg_match(self::NAME, $rest) === 1 ? $rest : null;
            }
        }
        return null;
    }

    /** @return list<string> */
    private static function toolNames(mixed $tools): array
    {
        $out = [];
        foreach (is_array($tools) ? $tools : [] as $tool) {
            if (is_string($tool) && preg_match(self::TOOL, $tool) === 1) {
                $out[] = $tool;
            }
        }
        return array_values($out);
    }
}
