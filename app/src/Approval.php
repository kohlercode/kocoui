<?php
declare(strict_types=1);

namespace KocoUI;

/**
 * Approval identity for Hermes 0.22+ (exact {request_id, execution_generation, choice})
 * and the older {choice[, request_id]} body.
 */
final class Approval
{
    /** @return array{choice:string, request_id?:string, execution_generation?:int} */
    public static function hermesBody(string $choice, string $requestId, ?int $generation): array
    {
        if ($generation !== null) {
            return [
                'request_id' => $requestId,
                'execution_generation' => $generation,
                'choice' => $choice,
            ];
        }
        $body = ['choice' => $choice];
        if ($requestId !== '') {
            $body['request_id'] = $requestId;
        }
        return $body;
    }

    /** @return array{request_id:string, command:string, description:string, choices:list<string>, execution_generation?:int, smart_denied?:true}|null */
    public static function fromHermesStatus(array $res): ?array
    {
        if (isset($res['approval']) && is_array($res['approval'])) {
            return self::card($res['approval'], $res);
        }
        if (($res['status'] ?? '') !== 'waiting_for_approval') {
            return null;
        }
        $pending = is_array($res['pending_controls'] ?? null) ? $res['pending_controls'] : [];
        foreach ($pending as $row) {
            if (is_array($row) && ($row['kind'] ?? '') === 'approval') {
                return self::card($row, $res);
            }
        }
        foreach ($pending as $row) {
            if (is_array($row)) {
                return self::card($row, $res);
            }
        }
        return null;
    }

    /** @return array{request_id:string, command:string, description:string, choices:list<string>, execution_generation?:int, smart_denied?:true} */
    public static function card(array $raw, array $run = []): array
    {
        $id = (string) ($raw['request_id'] ?? $raw['prompt_id'] ?? '');
        $choices = array_values(array_filter((array) ($raw['choices'] ?? []), 'is_string'));
        $out = [
            'request_id' => $id,
            'command' => (string) ($raw['command'] ?? ''),
            'description' => (string) ($raw['description'] ?? ''),
            'choices' => $choices,
        ];
        $gen = self::generation($raw['execution_generation'] ?? $run['execution_generation'] ?? null);
        if ($gen !== null) {
            $out['execution_generation'] = $gen;
        }
        if (!empty($raw['smart_denied'])) {
            $out['smart_denied'] = true;
        }
        return $out;
    }

    public static function generation(mixed $value): ?int
    {
        if (is_int($value) && $value >= 1) {
            return $value;
        }
        if (is_string($value) && ctype_digit($value)) {
            $n = (int) $value;
            return $n >= 1 ? $n : null;
        }
        return null;
    }
}
