// TRICERA-OPTIONS: -cex -memsafety -valid-memcleanup -arithMode:ilp32
void main() {
  int a[42], b[10];
  a[0] = 0; // prevent optimisation
  b[0] = 1;
}
