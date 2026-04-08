// A simple program where the assertion fails.
// Result: UNSAFE (x is 10 after the loop, not 11)

void main() {
  int x = 0;

  while (x < 10) {
    x++;
  }

  assert(x == 11);
}
