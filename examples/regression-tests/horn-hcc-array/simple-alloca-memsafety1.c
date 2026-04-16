// TRICERA-OPTIONS: -cex -memsafety -valid-memcleanup
void main() {
  int a[];
  a = alloca(sizeof(int)*42);
  a[0] = 0;
}
