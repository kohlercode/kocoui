<?php
declare(strict_types=1);

final class TestCase
{
    public static int $passed = 0;
    public static int $failed = 0;

    public static function assertSame(mixed $expected, mixed $actual, string $message = ''): void
    {
        if ($expected === $actual) {
            self::$passed++;
            return;
        }
        self::$failed++;
        echo 'FAIL  ' . $message . ' expected ' . var_export($expected, true) . ' got ' . var_export($actual, true) . "\n";
    }

    public static function assertTrue(mixed $value, string $message = ''): void
    {
        self::assertSame(true, $value === true, $message !== '' ? $message : 'expected true');
    }

    public static function assertFalse(mixed $value, string $message = ''): void
    {
        self::assertSame(true, $value === false, $message !== '' ? $message : 'expected false');
    }

    public static function assertNull(mixed $value, string $message = ''): void
    {
        self::assertSame(null, $value, $message !== '' ? $message : 'expected null');
    }

    public static function assertThrows(string $class, callable $fn, string $message = ''): void
    {
        try {
            $fn();
        } catch (Throwable $e) {
            if ($e instanceof $class) {
                self::$passed++;
                return;
            }
            self::$failed++;
            echo 'FAIL  ' . $message . ' threw ' . $e::class . ': ' . $e->getMessage() . "\n";
            return;
        }
        self::$failed++;
        echo 'FAIL  ' . $message . " did not throw\n";
    }
}
