// TRICERA-OPTIONS: -valid-free
#include <stdlib.h>

void foo() {
  int *x = alloca(sizeof(int));
}

void main() {
  foo();
}
