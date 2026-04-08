// Build a simple doubly-linked list with two nodes.
// Result: SAFE

struct node {
  struct node *L;
  struct node *R;
};

void main() {
  struct node *list = malloc(sizeof(struct node));
  list->L = 0;
  list->R = 0;
  struct node *tail = list;

  struct node *n = malloc(sizeof(struct node));
  n->L = tail;
  n->R = 0;
  tail->R = n;
  tail = n;

  // The list has two distinct nodes
  assert(list != tail);
}
