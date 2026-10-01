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
  // assume(N >= 0); // this assumption is needed to make the program safe

  struct Node * head = malloc(sizeof(struct Node));
  struct Node * cur  = head;

  for (int i = 0; i < N; i++) {
    struct Node * next = malloc(sizeof(struct Node));
    WRITE_NODE(cur, i, next);
    cur = next;
  }
  WRITE_NODE(cur, N, 0);

  cur = head;
  int j = 0;
  while(cur != 0) {
    struct Node n = (*(cur));
    if(n.data != j) reach_error();
    cur = n.next;
    j++;
  }
  return 0;
}
