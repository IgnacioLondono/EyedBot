const crypto = require('crypto');

const TRIVIA_QUESTIONS = Object.freeze([
    { id: 'solar-system', prompt: '¿Cuál es el planeta más grande del sistema solar?', choices: ['Marte', 'Júpiter', 'Venus', 'Saturno'], answer: 1 },
    { id: 'pacific', prompt: '¿Cuál es el océano más grande?', choices: ['Atlántico', 'Índico', 'Pacífico', 'Ártico'], answer: 2 },
    { id: 'binary', prompt: '¿Qué base utiliza el sistema binario?', choices: ['2', '8', '10', '16'], answer: 0 },
    { id: 'chile-capital', prompt: '¿Cuál es la capital de Chile?', choices: ['Valparaíso', 'Santiago', 'Concepción', 'La Serena'], answer: 1 },
    { id: 'water', prompt: '¿Cuál es la fórmula química del agua?', choices: ['CO₂', 'NaCl', 'O₂', 'H₂O'], answer: 3 }
]);

function secureIndex(size) {
    return crypto.randomInt(0, size);
}

function publicTriviaState(state) {
    const question = TRIVIA_QUESTIONS.find((item) => item.id === state.questionId);
    return {
        questionId: state.questionId,
        prompt: question?.prompt || '',
        choices: question?.choices || [],
        answeredUserIds: Object.keys(state.answers || {}),
        winners: state.winners || []
    };
}

const adapters = {
    trivia: {
        create(randomIndex = secureIndex) {
            const question = TRIVIA_QUESTIONS[randomIndex(TRIVIA_QUESTIONS.length)];
            return { questionId: question.id, answers: {}, winners: [] };
        },
        publicState: publicTriviaState,
        apply(state, action, context) {
            if (action.type !== 'answer') throw new Error('ACTION_NOT_SUPPORTED');
            if (Object.hasOwn(state.answers || {}, context.userId)) throw new Error('ALREADY_ACTED');
            const question = TRIVIA_QUESTIONS.find((item) => item.id === state.questionId);
            const choice = Number(action.choice);
            if (!question || !Number.isInteger(choice) || choice < 0 || choice >= question.choices.length) {
                throw new Error('INVALID_ACTION');
            }
            const correct = choice === question.answer;
            const answers = { ...(state.answers || {}), [context.userId]: { choice, correct } };
            const completed = Object.keys(answers).length >= context.participantCount;
            const winners = completed
                ? Object.entries(answers).filter(([, value]) => value.correct).map(([userId]) => userId)
                : [];
            return {
                state: { ...state, answers, winners },
                completed,
                winners,
                result: { correct }
            };
        }
    },
    dice: {
        create() {
            return { rolls: {}, winners: [] };
        },
        publicState(state) {
            return { rolls: state.rolls || {}, winners: state.winners || [] };
        },
        apply(state, action, context, randomInt = crypto.randomInt) {
            if (action.type !== 'roll') throw new Error('ACTION_NOT_SUPPORTED');
            if (Object.hasOwn(state.rolls || {}, context.userId)) throw new Error('ALREADY_ACTED');
            const roll = randomInt(1, 7);
            const rolls = { ...(state.rolls || {}), [context.userId]: roll };
            const completed = Object.keys(rolls).length >= context.participantCount;
            const max = completed ? Math.max(...Object.values(rolls)) : null;
            const winners = completed
                ? Object.entries(rolls).filter(([, value]) => value === max).map(([userId]) => userId)
                : [];
            return {
                state: { ...state, rolls, winners },
                completed,
                winners,
                result: { roll }
            };
        }
    }
};

function getPartyAdapter(type) {
    return adapters[String(type || '').toLowerCase()] || null;
}

module.exports = { TRIVIA_QUESTIONS, getPartyAdapter };
