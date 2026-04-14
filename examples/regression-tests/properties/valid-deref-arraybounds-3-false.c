// TRICERA-OPTIONS: -valid-deref -arithMode:ilp32
#include <stdlib.h>
extern int nondet();

void main() {
    int n = nondet();
    int *arr = (int*) malloc(sizeof(int)*n);
    arr[n] = 42;
    free(arr);
}
