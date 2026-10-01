extern int __VERIFIER_nondet_int(void);

void reach_error() { assert(0); }
struct Node {int data; struct Node * next;};

#define WRITE_NODE(PTR, DATA, NEXT) do {    \
  struct Node n;                        \
  n.data = (DATA);                      \
  n.next = (NEXT);                      \
  *((PTR)) = n;                      \
} while(0)

int main() {
  int N = __VERIFIER_nondet_int();

  struct Node * p = malloc(sizeof(struct Node));
  WRITE_NODE(p, 3, 0);

  struct Node n = (*(p));
  if(n.data != -1) reach_error(); // it was -1 when allocated, but was overwritten by the write

  return 0;
}
