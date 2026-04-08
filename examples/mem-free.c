// Use after free: accessing memory that was already freed.
// Check with property: Valid Free
// Result: UNSAFE

void main() {
  int *a = malloc(sizeof(int));
  *a = 10;
  free(a);
  *a = 42;  // use after free!
}
