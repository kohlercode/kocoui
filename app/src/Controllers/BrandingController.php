<?php
declare(strict_types=1);

namespace KocoUI\Controllers;

use KocoUI\Branding;
use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Http\Response;

final class BrandingController
{
    public static function show(Request $req): never
    {
        Response::json(Branding::publicState());
    }

    public static function save(Request $req): never
    {
        Response::json(Branding::saveSettings($req->json()));
    }

    public static function uploadIcon(Request $req, array $p): never
    {
        $slot = (string) ($p['slot'] ?? '');
        $max = match ($slot) {
            'logo' => Branding::MAX_LOGO_BYTES,
            'favicon' => Branding::MAX_ICO_BYTES,
            'icon192', 'icon512' => Branding::MAX_PNG_BYTES,
            default => Branding::MAX_PNG_BYTES,
        };
        $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? -1);
        if ($length > $max) {
            throw new HttpError(413, 'file_too_large', 'File exceeds the upload limit', ['max_bytes' => $max]);
        }
        if ($length === 0) {
            throw new HttpError(400, 'empty_file', 'The file is empty');
        }
        $name = rawurldecode($req->header('X-File-Name') ?? 'icon');
        $name = basename(str_replace(["\0", '\\'], '', $name));
        if ($name === '' || $name === '.' || $name === '..') {
            $name = 'icon';
        }

        $in = fopen('php://input', 'rb');
        if ($in === false) {
            throw new HttpError(400, 'empty_file', 'The file is empty');
        }
        $bytes = '';
        while (!feof($in)) {
            $chunk = fread($in, 1 << 20);
            if ($chunk === false) {
                break;
            }
            $bytes .= $chunk;
            if (strlen($bytes) > $max) {
                fclose($in);
                throw new HttpError(413, 'file_too_large', 'File exceeds the upload limit', ['max_bytes' => $max]);
            }
        }
        fclose($in);
        Response::json(Branding::saveIcon($slot, $bytes, $name));
    }

    public static function deleteIcon(Request $req, array $p): never
    {
        Response::json(Branding::deleteIcon((string) ($p['slot'] ?? '')));
    }
}
