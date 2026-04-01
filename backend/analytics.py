# Analytics module for rankings

def get_match_rankings(players):
    rankings = []
    num_matches = len(players[0]["scores"])

    for i in range(num_matches):
        match_scores = []
        for p in players:
            match_scores.append((p["name"], p["scores"][i]))

        sorted_players = sorted(match_scores, key=lambda x: x[1], reverse=True)

        rank_map = {}
        for rank, (name, _) in enumerate(sorted_players, start=1):
            rank_map[name] = rank

        rankings.append(rank_map)

    return rankings


def get_cumulative_rankings(players):
    rankings = []
    cumulative = {p["name"]: 0 for p in players}

    for i in range(len(players[0]["scores"])):
        for p in players:
            cumulative[p["name"]] += p["scores"][i]

        sorted_players = sorted(cumulative.items(), key=lambda x: x[1], reverse=True)

        rank_map = {}
        for rank, (name, _) in enumerate(sorted_players, start=1):
            rank_map[name] = rank

        rankings.append(rank_map)

    return rankings
