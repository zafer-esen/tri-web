// TRICERA-OPTIONS: -cex -valid-free
// Double free: the same allocation is freed twice.

void main() {
  int *a = malloc(sizeof(int));
  free(a);
  free(a);
}
