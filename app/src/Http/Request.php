<?php
declare(strict_types=1);

namespace KocoUI\Http;

final class Request
{
    private ?array $json = null;

    private function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        private readonly array $server,
    ) {
    }

    public static function fromGlobals(): self
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            is_string($path) && $path !== '' ? $path : '/',
            $_GET,
            $_SERVER,
        );
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $value = $this->server[$key] ?? null;
        return is_string($value) ? $value : null;
    }

    public function ip(): string
    {
        return (string) ($this->server['REMOTE_ADDR'] ?? '');
    }

    public function isSafeMethod(): bool
    {
        return in_array($this->method, ['GET', 'HEAD', 'OPTIONS'], true);
    }

    /** JSON request body as an array. Rejects anything that is not application/json. */
    public function json(): array
    {
        if ($this->json !== null) {
            return $this->json;
        }
        $type = strtolower((string) ($this->server['CONTENT_TYPE'] ?? ''));
        if (!str_starts_with($type, 'application/json')) {
            throw new HttpError(415, 'unsupported_media_type', 'Expected application/json');
        }
        $raw = file_get_contents('php://input');
        if ($raw === '' || $raw === false) {
            return $this->json = [];
        }
        try {
            $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new HttpError(400, 'invalid_json', 'Malformed JSON body');
        }
        if (!is_array($data)) {
            throw new HttpError(400, 'invalid_json', 'JSON body must be an object');
        }
        return $this->json = $data;
    }

    public function string(string $key, int $maxLength = 1000): string
    {
        $value = $this->json()[$key] ?? '';
        if (!is_string($value)) {
            throw new HttpError(400, 'invalid_input', "Field '$key' must be a string");
        }
        if (mb_strlen($value) > $maxLength) {
            throw new HttpError(400, 'invalid_input', "Field '$key' is too long");
        }
        return $value;
    }
}
