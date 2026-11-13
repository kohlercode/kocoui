<?php
declare(strict_types=1);

namespace KocoUI\Controllers;

use KocoUI\Hermes\HermesClient;
use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Http\Response;
use KocoUI\McpServers;

/** Read-only views of the agent's setup: models, toolsets, skills, MCP servers, scheduled jobs. */
final class AgentController
{
    public static function models(Request $req): never
    {
        $res = (new HermesClient())->modelOptions();
        $providers = [];
        foreach ($res['providers'] ?? [] as $p) {
            if (!is_array($p) || empty($p['authenticated']) || empty($p['models']) || !is_array($p['models'])) {
                continue;
            }
            $providers[] = [
                'slug' => (string) ($p['slug'] ?? ''),
                'name' => (string) ($p['name'] ?? $p['slug'] ?? ''),
                'models' => array_values(array_filter($p['models'], 'is_string')),
            ];
        }
        Response::json([
            'current' => ['provider' => (string) ($res['provider'] ?? ''), 'model' => (string) ($res['model'] ?? '')],
            'providers' => $providers,
        ]);
    }

    public static function toolsets(Request $req): never
    {
        $res = (new HermesClient())->toolsets();
        $out = [];
        foreach ($res['data'] ?? [] as $t) {
            if (!is_array($t)) {
                continue;
            }
            $out[] = [
                'name' => (string) ($t['name'] ?? ''),
                'label' => (string) ($t['label'] ?? $t['name'] ?? ''),
                'description' => (string) ($t['description'] ?? ''),
                'enabled' => (bool) ($t['enabled'] ?? false),
                'configured' => (bool) ($t['configured'] ?? false),
                'tools' => array_values(array_filter((array) ($t['tools'] ?? []), 'is_string')),
            ];
        }
        Response::json(['data' => $out]);
    }

    public static function skills(Request $req): never
    {
        try {
            $res = (new HermesClient())->skills();
        } catch (HttpError $e) {
            // Hermes' own /v1/skills is broken in some releases; that is not our gateway failing.
            if ($e->status !== 502 || in_array($e->errorCode, ['hermes_unreachable', 'hermes_auth'], true)) {
                throw $e;
            }
            Response::json(['data' => [], 'available' => false]);
        }
        $out = [];
        foreach ($res['data'] ?? $res['skills'] ?? [] as $s) {
            if (!is_array($s)) {
                continue;
            }
            $out[] = [
                'name' => (string) ($s['name'] ?? ''),
                'description' => (string) ($s['description'] ?? ''),
                'category' => (string) ($s['category'] ?? ''),
                'enabled' => !array_key_exists('enabled', $s) || (bool) $s['enabled'],
            ];
        }
        Response::json(['data' => $out, 'available' => true]);
    }

    public static function mcpServers(Request $req): never
    {
        $client = new HermesClient();
        try {
            $live = McpServers::fromHermes($client->mcpServers());
            try {
                $live = McpServers::withTools($live, McpServers::fromToolsets($client->toolsets()));
            } catch (HttpError) {
                // Status from /v1/mcp/servers is enough.
            }
            Response::json(['data' => $live, 'source' => 'mcp']);
        } catch (HttpError $e) {
            if (in_array($e->errorCode, ['hermes_unreachable', 'hermes_auth'], true)) {
                throw $e;
            }
            if ($e->status !== 404 && $e->status !== 502) {
                throw $e;
            }
        }
        Response::json(['data' => McpServers::fromToolsets($client->toolsets()), 'source' => 'toolsets']);
    }

    /** POST /v1/mcp/reload when Hermes exposes it; no config or secrets in the body. */
    public static function mcpReload(Request $req): never
    {
        $client = new HermesClient();
        try {
            $res = $client->mcpReload();
        } catch (HttpError $e) {
            if ($e->status === 404 || str_starts_with($e->errorCode, 'hermes_404')) {
                throw new HttpError(
                    501,
                    'mcp_reload_unavailable',
                    'This Hermes build has no MCP reload API',
                );
            }
            throw $e;
        }
        $servers = (int) ($res['server_count'] ?? $res['servers'] ?? 0);
        $tools = (int) ($res['tool_count'] ?? $res['tools'] ?? 0);
        Response::json([
            'ok' => true,
            'servers' => max(0, $servers),
            'tools' => max(0, $tools),
        ]);
    }

    public static function jobs(Request $req): never
    {
        // Always try Hermes /api/jobs. Hermes may report features.jobs_admin false
        // while the routes still work (cron created via the agent tools).
        $client = new HermesClient();
        $out = [];
        foreach ($client->jobs()['jobs'] ?? [] as $j) {
            if (!is_array($j)) {
                continue;
            }
            $out[] = [
                'id' => (string) ($j['id'] ?? ''),
                'name' => (string) ($j['name'] ?? ''),
                'schedule' => (string) ($j['schedule_display'] ?? $j['schedule'] ?? ''),
                'enabled' => (bool) ($j['enabled'] ?? true),
                'next_run_at' => $j['next_run_at'] ?? null,
                'last_run_at' => $j['last_run_at'] ?? null,
                'last_status' => $j['last_status'] ?? null,
            ];
        }
        Response::json(['data' => $out]);
    }
}
