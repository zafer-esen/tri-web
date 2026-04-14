// TRICERA-OPTIONS: -valid-free -arithMode:ilp32
#include <stdlib.h>

void main() {
  int *x = malloc(sizeof(int)*42);
  free(x);
}
