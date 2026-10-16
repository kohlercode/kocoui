<?php
declare(strict_types=1);

namespace KocoUI\Controllers;

use KocoUI\Files;
use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Http\Response;
use KocoUI\Work;

final class WorkController
{
    public static function listing(Request $req): never
    {
        $rel = self::path($req);
        $page = Work::listing($rel) ?? throw new HttpError(404, 'not_found', 'Folder not found');
        Response::json($page);
    }

    public static function file(Request $req): never
    {
        $rel = self::path($req);
        $real = Work::file($rel) ?? throw new HttpError(404, 'not_found', 'File not found');
        $mime = Files::mime($real);
        $download = ($req->query['download'] ?? '') === '1' || !Files::inlineSafe($mime);
        $type = Files::inlineSafe($mime) ? $mime : 'application/octet-stream';
        $location = $mime === 'application/pdf' && !$download ? '/_work_pdf/' : '/_work/';
        $name = basename($real);
        $ascii = preg_replace('/[^\x20-\x7E]|["\\\\]/', '_', $name);
        $relative = Work::relativeOf($real);

        header_remove('Cache-Control');
        header('Content-Type: ' . $type);
        header(sprintf('Content-Disposition: %s; filename="%s"; filename*=UTF-8\'\'%s',
            $download ? 'attachment' : 'inline', $ascii, rawurlencode($name)));
        header('X-Accel-Redirect: ' . $location . implode('/', array_map('rawurlencode', explode('/', $relative))));
        exit;
    }

    public static function text(Request $req): never
    {
        $rel = self::path($req);
        $real = Work::file($rel) ?? throw new HttpError(404, 'not_found', 'File not found');
        $body = Work::readText($real) ?? throw new HttpError(415, 'not_text', 'This file cannot be previewed as text');
        Response::json($body);
    }

    public static function thumb(Request $req): never
    {
        $rel = self::path($req);
        $real = Work::file($rel) ?? throw new HttpError(404, 'not_found', 'File not found');
        $width = (int) ($req->query['w'] ?? 480);
        if (!Files::thumbable(Files::mime($real))) {
            throw new HttpError(415, 'no_thumbnail', 'No thumbnail for this file type');
        }
        Files::sendThumbnail($real, $width, '/_work/', Work::relativeOf($real));
    }

    private static function path(Request $req): string
    {
        if (Work::root() === null) {
            throw new HttpError(503, 'work_unavailable', 'The work directory is not set up');
        }
        $raw = $req->query['path'] ?? '';
        if (!is_string($raw)) {
            throw new HttpError(400, 'invalid_input', 'Invalid path');
        }
        return Work::relative($raw) ?? throw new HttpError(400, 'invalid_input', 'Invalid path');
    }
}
