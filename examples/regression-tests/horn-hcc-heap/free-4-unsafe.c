// TRICERA-OPTIONS: -cex -heapModel:native -valid-deref -arithMode:ilp32
int nondet();

void main() {
  int *a = malloc(sizeof(int));
  free(a);
  int *b = a;
  *b = 42;
}
