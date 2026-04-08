// Swap two values via pointers using heap allocation.
// Result: SAFE

void swap(int *x, int *y) {
  int tmp = *x;
  *x = *y;
  *y = tmp;
}

void main() {
  int a = 3;
  int *b = calloc(sizeof(int));
  *b = 42;

  swap(&a, b);

  assert(a == 42);
  assert(*b == 3);
}
