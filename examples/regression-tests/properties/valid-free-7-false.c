// TRICERA-OPTIONS: -valid-free -arithMode:ilp32
#include <stdlib.h>

void main() {
  int x[42];
  free(x);
}
