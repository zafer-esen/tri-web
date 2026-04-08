// Loop invariant: i is always non-negative and bounded.
// TriCera infers the invariant automatically.
// Result: SAFE

void main() {
  int n = 100;
  int sum = 0;

  for (int i = 0; i < n; i++) {
    sum += i;
    assert(sum >= 0);
  }
}
