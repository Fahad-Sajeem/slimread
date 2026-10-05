#include <stdio.h>

struct auth_service {
    int count;
};

static int helper(int n) {
    return n * 2;
}

int *login(struct auth_service *s, const char *user) {
    return &s->count;
}
