# Append this to src/main.py to trigger the Big-O Auditor agent.
# This function is deliberately O(n*m) — the agent should flag it.
#
# Matches the function used in the YouTube gh-aw demo.


def find_matching_records(dataset_a, dataset_b):
    """
    Finds common elements between two datasets.
    This is intentionally inefficient (O(n*m)) for the demo.
    """
    matches = []

    # The performance bottleneck: Nested loops
    for item_a in dataset_a:
        # 'in' operator on a list is O(n), making the total O(n^2)
        if item_a in dataset_b:
            if item_a not in matches:
                matches.append(item_a)

    return matches


print(find_matching_records(data_1, data_2))
