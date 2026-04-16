// TRICERA-OPTIONS: -valid-memcleanup
#include <stdlib.h>

void main() {
    int *p = malloc(sizeof(int));
    free(p);
}
