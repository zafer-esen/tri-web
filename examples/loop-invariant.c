// TRICERA-OPTIONS: -cex -inv -acsl
// TriCera infers a loop invariant automatically.

void main() {
  int n = 100;
  int sum = 0;

  for (int i = 0; i < n; i++) {
    sum += i;
    assert(sum >= 0);
  }
}
