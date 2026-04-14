// TRICERA-OPTIONS: -cex -heapModel:native -valid-deref -arithMode:ilp32
void main() {
  int *a = malloc(sizeof(int));
  free(a);
  *a = 42; // unsafe - use after free
}
