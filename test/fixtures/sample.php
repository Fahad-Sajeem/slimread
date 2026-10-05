<?php

interface Store {
    public function get(string $k): string;
}

class AuthService {
    public function login(string $user): ?string {
        return $this->db[$user] ?? null;
    }
}

function helper(int $n): int {
    return $n * 2;
}
