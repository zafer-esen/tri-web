// TRICERA-OPTIONS: -cex -heapModel:native
void main() {
  int *x = calloc(sizeof(int));
  int *y = 1;
  *y = 42;
}

