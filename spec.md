This document describes the structure of the game-objects, client- and server-side, on the Tobi Go Server.

Frontend: Javascript
Backend: Firebase Realtime Database

# Definitions / classes

A "player" is either a human player (1-5) or the random player (0).

A "color" describes a colored stone (1-5), an empty node (0) or a deleted node (-1).

A "node" represents an intersection on the go board. It has the following properties:
"x" and "y" coordinates (floats) representing visual position when the board is drawn. The coordinate system is such that connected nodes have a distance of 1.
"color" (the color of the node)
"neighbours" (an array of connected nodes)
"onlyVisibleTo" (if set, only this player can see the stone. May only be set for nodes of colors 1-5)

A "turn" represents a move to be made.
It may have following properties:
"player" (the player that makes the move)
"color" (the color the intersection will be after the move)
"hidden" (boolean)
"traitorColor" (a second color)
"traitorPercentage" (an integer 1-50)
(A move that is either hidden or a traitor can only use colors 1-5. A move cannot be both hidden and a traitor.)

A "sequence" is a non-empty array of turns.

A "move" represents a move that was made. It may have the following properties:
"index" (the index of the node the move was made at)
"color" (the resulting color of the move: may equal either turn.color or turn.traitorColor)
"timeLeft" (the time in ms remaining on the players clock after the move was made, increment added, and clock paused)
"power" (the index of the power that was triggered on the move) 
"revealed" (the index of a node where a hidden stone was revealed by the player attempting to play there)
"pass" (1 if the move was a pass)

Exactly one of (index + color) / (power) / (revealed) / (pass) is defined.

A "timeSetting" is defined by the following properties, all in milliseconds:
maintime
increment
cap

A "clock" is defined by a single integer representing a time in milliseconds.
If the value is less than 1e12, it means that the clock is paused, and the number is the current amount of time left.
Otherwise, the number represents the timestamp when the clock will expire.
(time left is computed clientside, based on the approximated server timestamp)

A "gameSetting" is defined by the following:
"boardType" (one of a small list of strings: "grid", "star", "hexagon" etc)
"boardSize" (integer, each board type has its own min and max size that is allowed here)
(a board object is constructeed based on these two parameters)
"players" (integer 2-5)
(if players = 2, then only players 1 and 2 are allowed in turns defined below. The colors 1-5 are always allowed, regardless of the number of players)
"setupStones": an array of moves of the form {index, color} that are made as part of board initialization.
(this directly sets the color at each index, without doing any other move logic like resolving captures or advancing turn number. these moves are not part of the move history: to the user the board with these colors set is the initial state of the board)
"setupTurns": an array of sequences (non-empty arrays of turns), each with an associated "repeat" value that is a positive integer.
(these turns are stepped through in order at the beginning of the game, allowing things like free placement handicap stones or randomly placed stones. these are part of the move history)
"mainSequence": a single sequence which is cycled continually throughout the game (after the setup turns)
"powers": for each player, an array of sequences, each with an associated "numberOfUses". (a player can trigger one of their powers on their turn: the main sequence is then temporarily paused while the triggered sequence is stepped through. afterwards the main sequence continues where it left off. The player that triggered their power uses up their turn to do so.)
"komi": an object containing the komi value for each player
"timeSettings": for each player, a timeSetting (this may also be ommited, for a game without any time limits)

A "request" represents an outstanding request from one of the players to perform an action that all players must agree to. It has properties:
"type": one of "undo", "pause", "continue", "score" etc
"moveNumber": if type is undo, the moveNumber to undo to
"agrees": for each player, true or false. updated as more players agree.

A "game" extends a "gameSetting" with the following additional properties:
"clocks": for each player, the current value of their clock
"moves": an array of all the moves made throughout the game
"request": defined if there is an outstanding request, otherwise null (there is at most one request open at once)

All the properties inherited from gameSetting are static throughout a game.
The current state of the board is not stored anywhere on the server.
Instead, making a move only appends to the move array and updates the clocks.

Each client computes the current state by applying each move in turn from the initial state.

A "board" is the local object that tracks the current state. It extends a "gameSetting" with the following additional properties:
"nodes" (an array of all the nodes)
"visitedStates" (a set of strings, added to after each move, used to check superko)
"powers": just like the powers property of the gameSetting object, except that in this one the "numberOfUses" is decremented when a power is used to track how many uses there are left.
"currentTurn": the turn object representing the next move to make
"mainIndex": the index we are currently at in the main sequence
"currentSequence": the sequence object for a currently triggered power or setup sequence. While the game is inside the mainSequence, this is set to null.
"sequenceIndex": the current index inside the "currentSequence", otherwise null.

(note: this extends gameSetting, not game. Clocks and requests are handled separately.)

Important: For all objects stored on the server, keys are replaced with single characters to save bandwidth. The client-side code defines `const COLOR = "c"`etc, to keep the code readable.