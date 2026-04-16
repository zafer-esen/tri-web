// TRICERA-OPTIONS: -valid-free
#include <stdlib.h>

void main() {
  int *x = malloc(sizeof *x);
  free(x);
}
