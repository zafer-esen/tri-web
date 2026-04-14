// TRICERA-OPTIONS: -cex -heapModel:native -memsafety -arithMode:ilp32
int nondet();

void main() {
  int *a = malloc(sizeof(int));
  free(a);
  int *b = a; // safe
}
