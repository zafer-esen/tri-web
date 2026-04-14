// TRICERA-OPTIONS: -valid-memcleanup -arithMode:ilp32
#include <stdlib.h>

void main() {
    int *p = malloc(sizeof(int));
    free(p);
}
