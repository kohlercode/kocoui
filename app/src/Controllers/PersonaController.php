<?php
declare(strict_types=1);

namespace KocoUI\Controllers;

use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Http\Response;
use KocoUI\Soul;

/** Reads and saves the persona. The browser never chooses the path. */
final class PersonaController
{
    public static function show(Request $req): never
    {
        Response::json(Soul::read());
    }

    public static function save(Request $req): never
    {
        $content = $req->json()['content'] ?? null;
        if (!is_string($content)) {
            throw new HttpError(400, 'persona_invalid', 'The persona text must be a string');
        }
        Response::json(Soul::write($content));
    }

    public static function restore(Request $req): never
    {
        Response::json(Soul::restore());
    }
}
