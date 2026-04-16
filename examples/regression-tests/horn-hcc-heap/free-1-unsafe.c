// TRICERA-OPTIONS: -cex -heapModel:native -valid-deref
void main() {
  int *a = malloc(sizeof(int));
  free(a);
  *a = 42; // unsafe - use after free
}
