// TRICERA-OPTIONS: -cex -valid-deref
#include <stdlib.h>
#include <assert.h>

int a[42];

void main() {
  a[-1] = 3;
}
