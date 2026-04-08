// A simple loop where x and y stay equal.
// Result: SAFE

void main() {
  int x = 0;
  int y = 0;

  while (x < 10) {
    x++;
    y++;
  }

  assert(x == y);
}
