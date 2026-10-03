<?php
declare(strict_types=1);

namespace KocoUI\Controllers;

use KocoUI\Config;
use KocoUI\Files;
use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Http\Response;
use KocoUI\Session;
use KocoUI\Uploads;

final class FilesController
{
    /** Raw request body, so PHP's multipart handling (file_uploads) stays disabled. */
    public static function upload(Request $req): never
    {
        $max = self::maxBytes();
        $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? -1);
        if ($length > $max) {
            throw new HttpError(413, 'file_too_large', 'File exceeds the upload limit', ['max_bytes' => $max]);
        }
        if ($length === 0) {
            throw new HttpError(400, 'empty_file', 'The file is empty');
        }
        $name = Files::sanitizeName(rawurldecode($req->header('X-File-Name') ?? ''));

        $id = bin2hex(random_bytes(8));
        $rel = gmdate('Y-m') . '/' . $id . '/' . $name;
        $dir = Files::inbox() . '/' . dirname($rel);
        if (!mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new HttpError(500, 'upload_failed', 'Could not store the file');
        }
        $target = $dir . '/' . $name;
        $in = fopen('php://input', 'rb');
        $out = fopen($target, 'xb');
        $size = 0;
        while ($in && $out && !feof($in)) {
            $chunk = fread($in, 1 << 20);
            if ($chunk === false) {
                break;
            }
            $size += strlen($chunk);
            if ($size > $max) {
                break;
            }
            fwrite($out, $chunk);
        }
        $in && fclose($in);
        $out && fclose($out);
        if (!$out || $size === 0 || $size > $max) {
            @unlink($target);
            @rmdir($dir);
            throw $size > $max
                ? new HttpError(413, 'file_too_large', 'File exceeds the upload limit', ['max_bytes' => $max])
                : new HttpError(400, 'empty_file', 'The file is empty');
        }
        chmod($target, 0640);

        $mime = Files::mime($target);
        Uploads::add($id, (int) Session::userId(), $name, $mime, $size, $rel);
        Response::json(['id' => $id] + Files::info($target), 201);
    }

    public static function deleteUpload(Request $req, array $p): never
    {
        if (!preg_match('/^[a-f0-9]{16}$/', $p['id'])) {
            throw new HttpError(404, 'not_found', 'Unknown upload');
        }
        $row = Uploads::find($p['id'], (int) Session::userId());
        if ($row === null) {
            throw new HttpError(404, 'not_found', 'Unknown upload');
        }
        if ($row['session_id'] !== null) {
            throw new HttpError(409, 'upload_in_use', 'The file was already sent');
        }
        Uploads::remove($row);
        Response::json(['deleted' => true]);
    }

    public static function meta(Request $req): never
    {
        $paths = $req->json()['paths'] ?? null;
        if (!is_array($paths) || count($paths) > 200) {
            throw new HttpError(400, 'invalid_input', 'paths must be a list of up to 200 entries');
        }
        $out = [];
        foreach ($paths as $path) {
            if (!is_string($path)) {
                continue;
            }
            $real = Files::resolve($path);
            $out[] = $real === null ? ['path' => $path, 'missing' => true] : ['requested' => $path] + Files::info($real);
        }
        Response::json(['data' => $out]);
    }

    public static function serve(Request $req): never
    {
        $real = Files::resolve((string) ($req->query['path'] ?? '')) ?? throw new HttpError(404, 'not_found', 'File not found');
        $mime = Files::mime($real);
        $download = ($req->query['download'] ?? '') === '1' || !Files::inlineSafe($mime);
        $type = Files::inlineSafe($mime) ? $mime : 'application/octet-stream';
        $location = $mime === 'application/pdf' && !$download ? '/_files_pdf/' : '/_files/';
        $name = basename($real);
        $ascii = preg_replace('/[^\x20-\x7E]|["\\\\]/', '_', $name);

        header_remove('Cache-Control');
        header('Content-Type: ' . $type);
        header(sprintf('Content-Disposition: %s; filename="%s"; filename*=UTF-8\'\'%s',
            $download ? 'attachment' : 'inline', $ascii, rawurlencode($name)));
        header('X-Accel-Redirect: ' . $location . implode('/', array_map('rawurlencode', explode('/', Files::relative($real)))));
        exit;
    }

    public static function thumb(Request $req): never
    {
        $real = Files::resolve((string) ($req->query['path'] ?? '')) ?? throw new HttpError(404, 'not_found', 'File not found');
        $width = (int) ($req->query['w'] ?? 480);
        if (!in_array($width, Files::THUMB_WIDTHS, true)) {
            $width = 480;
        }
        $mime = Files::mime($real);
        if (!Files::thumbable($mime)) {
            throw new HttpError(415, 'no_thumbnail', 'No thumbnail for this file type');
        }
        $key = sha1($real . '|' . filemtime($real) . '|' . filesize($real) . '|' . $width);
        $cacheDir = APP_ROOT . '/var/cache/thumbs/' . substr($key, 0, 2);
        $webp = function_exists('imagewebp');
        $cache = $cacheDir . '/' . $key . ($webp ? '.webp' : '.jpg');

        if (!is_file($cache)) {
            $dim = @getimagesize($real);
            // Small images and huge ones (decoding would blow the memory limit) are served as they are.
            if (!$dim || $dim[0] <= $width || $dim[0] * $dim[1] > 40_000_000) {
                self::redirectToOriginal($real, $mime);
            }
            $src = @imagecreatefromstring((string) file_get_contents($real));
            if ($src === false) {
                self::redirectToOriginal($real, $mime);
            }
            $height = max(1, (int) round($dim[1] * $width / $dim[0]));
            $dst = imagecreatetruecolor($width, $height);
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $width, $height, $dim[0], $dim[1]);
            if (!is_dir($cacheDir)) {
                mkdir($cacheDir, 0700, true);
            }
            $tmp = $cache . '.' . bin2hex(random_bytes(4));
            $webp ? imagewebp($dst, $tmp, 82) : imagejpeg($dst, $tmp, 82);
            rename($tmp, $cache);
        }
        header('Content-Type: ' . ($webp ? 'image/webp' : 'image/jpeg'));
        header('Cache-Control: private, max-age=86400');
        header('Content-Length: ' . filesize($cache));
        readfile($cache);
        exit;
    }

    private static function redirectToOriginal(string $real, string $mime): never
    {
        header_remove('Cache-Control');
        header('Content-Type: ' . $mime);
        header('Content-Disposition: inline');
        header('X-Accel-Redirect: /_files/' . implode('/', array_map('rawurlencode', explode('/', Files::relative($real)))));
        exit;
    }

    public static function maxBytes(): int
    {
        return max(1, (int) Config::get('files.max_upload_mb', 50)) * 1024 * 1024;
    }
}
