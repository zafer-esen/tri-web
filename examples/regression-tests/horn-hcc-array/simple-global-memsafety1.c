// TRICERA-OPTIONS: -cex -memsafety -valid-memcleanup -arithMode:ilp32
int a[42];

void main() {
  assert(a[0] == 0);
}
