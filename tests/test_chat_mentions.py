from open_notebook.ai.decisions import decision_input
from open_notebook.utils.chat_mentions import (
    mention_instructions,
    mentions,
    plain_mentions,
)

MESSAGE = (
    "Compará @[Resumen.pdf](source:abc123) con @[Mis apuntes](note:n_1) "
    "y otra vez @[Resumen.pdf](source:abc123)"
)


def test_mentions_are_listed_once_in_order():
    assert mentions(MESSAGE) == [
        ("Resumen.pdf", "source:abc123"),
        ("Mis apuntes", "note:n_1"),
    ]
    assert mentions("escribime a @juan o @[roto](otro:1)") == []


def test_model_is_told_which_documents_were_referenced():
    text = mention_instructions(MESSAGE)
    assert "[source:abc123] Resumen.pdf" in text
    assert "[note:n_1] Mis apuntes" in text
    assert mention_instructions("sin menciones") == ""


def test_decisions_see_plain_titles():
    assert plain_mentions(MESSAGE).startswith("Compará @Resumen.pdf con @Mis apuntes")
    assert "source:abc123" not in decision_input(MESSAGE)
