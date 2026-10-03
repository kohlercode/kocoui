<?php
declare(strict_types=1);

namespace KocoUI\Controllers;

use KocoUI\Hermes\HermesClient;
use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Http\Response;

/** Read-only views of the agent's setup: models, toolsets, skills, scheduled jobs. */
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

    public static function jobs(Request $req): never
    {
        $client = new HermesClient();
        if (empty($client->capabilities()['features']['jobs_admin'])) {
            throw new HttpError(404, 'feature_disabled', 'Scheduled jobs are not enabled on this agent');
        }
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
