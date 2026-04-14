// TRICERA-OPTIONS: -valid-free -arithMode:ilp32
#include <stdlib.h>

void main() {
  int *x = malloc(sizeof *x);
  free(x);
  free(x); // double free - undefined behavior
}
