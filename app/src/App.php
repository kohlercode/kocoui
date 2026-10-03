<?php
declare(strict_types=1);

namespace KocoUI;

use KocoUI\Controllers\AgentController;
use KocoUI\Controllers\AuthController;
use KocoUI\Controllers\ChatController;
use KocoUI\Controllers\FilesController;
use KocoUI\Controllers\GatewayController;
use KocoUI\Controllers\PersonaController;
use KocoUI\Controllers\PushController;
use KocoUI\Http\Csrf;
use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Http\Response;
use KocoUI\Http\Router;

final class App
{
    public static function run(): void
    {
        header('Cache-Control: no-store');
        try {
            Config::load(APP_ROOT . '/config/config.php');
        } catch (\Throwable $e) {
            error_log('kocoui config: ' . $e->getMessage());
            http_response_code(503);
            header('Content-Type: text/plain; charset=utf-8');
            echo "Not configured.\n";
            return;
        }

        $req = Request::fromGlobals();

        if (!str_starts_with($req->path, '/api/')) {
            if ($req->path === '/manifest.webmanifest' && in_array($req->method, ['GET', 'HEAD'], true)) {
                self::manifest();
            }
            if (!in_array($req->method, ['GET', 'HEAD'], true) || str_contains(basename($req->path), '.')) {
                http_response_code(404);
                return;
            }
            Shell::render();
        }

        try {
            [$handler, $params, $opts] = self::routes()->match($req->method, $req->path);
            Session::start();
            if (!$req->isSafeMethod()) {
                Csrf::verify($req);
            }
            if ($opts['auth'] ?? true) {
                AuthController::requireUser();
            }
            if (!($opts['session_write'] ?? false)) {
                Session::release();
            }
            $handler($req, $params);
        } catch (HttpError $e) {
            Response::error($e);
        } catch (\Throwable $e) {
            error_log(sprintf('kocoui %s: %s at %s:%d', $e::class, $e->getMessage(), $e->getFile(), $e->getLine()));
            Response::error(new HttpError(500, 'internal_error', 'Internal error'));
        }
    }

    private static function routes(): Router
    {
        $r = new Router();
        $r->add('GET', '/api/auth/me', [AuthController::class, 'me'], ['auth' => false]);
        $r->add('POST', '/api/auth/login', [AuthController::class, 'login'], ['auth' => false, 'session_write' => true]);
        $r->add('POST', '/api/auth/logout', [AuthController::class, 'logout'], ['auth' => false, 'session_write' => true]);

        $r->add('GET', '/api/capabilities', [ChatController::class, 'capabilities']);
        $r->add('GET', '/api/models', [AgentController::class, 'models']);
        $r->add('GET', '/api/toolsets', [AgentController::class, 'toolsets']);
        $r->add('GET', '/api/skills', [AgentController::class, 'skills']);
        $r->add('GET', '/api/jobs', [AgentController::class, 'jobs']);
        $r->add('GET', '/api/persona', [PersonaController::class, 'show']);
        $r->add('PUT', '/api/persona', [PersonaController::class, 'save']);
        $r->add('POST', '/api/persona/restore', [PersonaController::class, 'restore']);
        $r->add('GET', '/api/gateway/status', [GatewayController::class, 'status']);
        $r->add('POST', '/api/gateway/restart', [GatewayController::class, 'restart']);
        $r->add('PUT', '/api/uploads', [FilesController::class, 'upload']);
        $r->add('DELETE', '/api/uploads/{id}', [FilesController::class, 'deleteUpload']);
        $r->add('POST', '/api/files/meta', [FilesController::class, 'meta']);
        $r->add('GET', '/api/files', [FilesController::class, 'serve']);
        $r->add('GET', '/api/files/thumb', [FilesController::class, 'thumb']);
        $r->add('GET', '/api/sessions', [ChatController::class, 'sessions']);
        $r->add('GET', '/api/sessions/{id}/messages', [ChatController::class, 'messages']);
        $r->add('PATCH', '/api/sessions/{id}', [ChatController::class, 'rename']);
        $r->add('DELETE', '/api/sessions/{id}', [ChatController::class, 'delete']);
        $r->add('POST', '/api/sessions/{id}/fork', [ChatController::class, 'fork']);
        $r->add('POST', '/api/runs', [ChatController::class, 'startRun']);
        $r->add('GET', '/api/runs/{id}', [ChatController::class, 'runStatus']);
        $r->add('GET', '/api/runs/{id}/events', [ChatController::class, 'runEvents']);
        $r->add('POST', '/api/runs/{id}/approval', [ChatController::class, 'approve']);
        $r->add('POST', '/api/runs/{id}/steer', [ChatController::class, 'steer']);
        $r->add('POST', '/api/runs/{id}/stop', [ChatController::class, 'stop']);
        $r->add('GET', '/api/push', [PushController::class, 'status']);
        $r->add('POST', '/api/push/subscribe', [PushController::class, 'subscribe']);
        $r->add('POST', '/api/push/unsubscribe', [PushController::class, 'unsubscribe']);
        return $r;
    }

    private static function manifest(): never
    {
        $name = (string) Config::get('app_name', 'Hermes');
        $origin = rtrim((string) Config::get('base_url'), '/');
        header('Content-Type: application/manifest+json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode([
            'id' => '/',
            'name' => $name,
            'short_name' => mb_substr($name, 0, 12),
            'start_url' => $origin . '/',
            'scope' => $origin . '/',
            'display' => 'standalone',
            'background_color' => '#212529',
            'theme_color' => '#212529',
            'icons' => [
                ['src' => $origin . '/icons/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => $origin . '/icons/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => $origin . '/icons/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
            ],
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        exit;
    }
}
