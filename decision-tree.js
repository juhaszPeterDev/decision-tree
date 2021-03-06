const fs = require('file-system');

const logger = {
    lines: [],
    log: (args) => {
        process.env.NODE_ENV === 'debug' ? console.log.apply(null,args):1;
    },
    startWriting: () => {
        this.lines = [];
    },
    addLine: (str) => {
        this.lines.push(str);
    },
    endWriting: () => {
        if (fs.writeFile !== undefined) {
            fs.writeFile('result.txt', this.lines.join('\n'), function(err) {})
        }
    }
};

const entropy = ({distribution, setCount}) => {
    let finalSum = 0;
    return distribution.reduce((sum, item) => {
        const p_i = item / setCount;
        finalSum += p_i;
        logger.log([finalSum]);
        if (p_i > 0){
            return sum - (p_i * Math.log2(p_i));
        }
        return sum;
    },0);
};

const getGroupsByDecisions = (decisions, possibleOutcomes) => {
    const questions = decisions[0].answers.map(_ => ({}));
    decisions.forEach((item, itemIndex) => {
        item.answers.forEach((value, index) => {
            if (questions[index][value] === undefined) {
                questions[index][value] = {};
                questions[index][value].distribution = possibleOutcomes.reduce((baseObj, outcome) => {
                    baseObj[outcome] = 0;
                    return baseObj;
                },{});
                questions[index][value].indexes = possibleOutcomes.reduce((baseObj, outcome) => {
                    baseObj = [];
                    return baseObj;
                },{});
            }
            questions[index][value].distribution[item.choice]++;
            questions[index][value].indexes.push(itemIndex);
        });
    });
    const result = questions.map(question => {
        return Object.keys(question).reduce((result,key)=>{
            const resultOnKey = {
                distribution:Object.values(question[key].distribution),
                indexes:Object.values(question[key].indexes),
                setCount:Object.values(question[key].distribution).reduce((sum, item) => sum+item, 0)
            };
            result[key] = resultOnKey;
            return result;
        },
        {});
    });
    return result;
};

const joinDistribution = (d1,d2) => {
    const result = {};
    result.distribution = d1.distribution.map((val, index) => val+d2.distribution[index]);
    result.indexes = d1.indexes.concat(d2.indexes);
    result.setCount = d1.setCount+d2.setCount;
    return result;
};

const informationGainOnQuestion = (questionGroup) => {
    const joinedDistribution = Object.keys(questionGroup).reduce((joinedDistribution, key) => {
        if (joinedDistribution === null) {
            return questionGroup[key];
        }
        return joinDistribution(joinedDistribution, questionGroup[key]);
    },null);
    const parentEntropy = entropy(joinedDistribution);
    const weighedSumOfEntropies = Object.keys(questionGroup).reduce((weighedSumOfEntropies, key) => {
        return weighedSumOfEntropies + (questionGroup[key].setCount/joinedDistribution.setCount) * entropy(questionGroup[key]);
    },0);
    return parentEntropy - weighedSumOfEntropies;
};

const createSubGroupsOnQuestionGroup = (decisions, questionGroup, questionIndex) => {
    const newDecisions = decisions.map(item => {
        const newItem = JSON.parse(JSON.stringify(item));
        newItem.answers.splice(questionIndex,1);
        return newItem;
    });
    const newGroups = [];
    Object.keys(questionGroup).forEach(key => {
        const newGroup = {chosenAnswer: key, decisions:[]};
        questionGroup[key].indexes.forEach(index => {
            newGroup.decisions.push(newDecisions[index]);
        });
        newGroups.push(newGroup);
    });
    return newGroups;
};

const getDecisionsEntropy = (decisions) => {
    const distribution = Object.values(decisions.reduce((hashMap, item) => {
        if (hashMap[item.choice] === undefined){
            hashMap[item.choice] = 0;
        }
        hashMap[item.choice]++;
        return hashMap;
    },{}));
    return entropy({distribution, setCount: decisions.length});
};

const informationGain = (decisions, possibleOutcomes) => {
    const baseEntropy = getDecisionsEntropy(decisions);
    logger.log(['Starter: ',baseEntropy]);
    const groups = getGroupsByDecisions(decisions, possibleOutcomes);
    const gainsOnQuestions = groups.map(informationGainOnQuestion);
    logger.log(['Gains: ',gainsOnQuestions]);
    const maxIndex = gainsOnQuestions.indexOf(gainsOnQuestions.reduce((maxValue,actVal) => actVal > maxValue ? actVal : maxValue,-1));
    const newSubGroups = createSubGroupsOnQuestionGroup(decisions, groups[maxIndex], maxIndex);
    logger.log(['Max index: ',maxIndex]);
    const newEntropies = newSubGroups.map(item => getDecisionsEntropy(item.decisions));
    logger.log(['Max gain: ',gainsOnQuestions[maxIndex]]);
    logger.log(['Result: ',newEntropies]);
    return {maxIndex, newSubGroups, entropyGain: baseEntropy-gainsOnQuestions[maxIndex], newEntropies, maxGain: gainsOnQuestions[maxIndex]};
};

const buildDecisionTree = (decisions, possibleOutcomes, questionList, depth) => {
    const root = {}
    const result = informationGain(decisions, possibleOutcomes);
    root.entropy = result.entropyGain+result.maxGain;
    root.entropyGain = result.entropyGain;
    root.question = questionList[result.maxIndex];
    root.children = result.newSubGroups.map((item, index) => {
        const child = {chosenAnswer:item.chosenAnswer,entropy: result.newEntropies[index]};
        if (depth > 0 && child.entropy){
            const newList = JSON.parse(JSON.stringify(questionList));
            newList.splice(result.maxIndex,1)
            child.nextQuestion = buildDecisionTree(item.decisions, possibleOutcomes, newList,depth-1);
        }
        child.distribution = item.decisions.reduce((distribution, decision) => {
            if (distribution[decision.choice] === undefined){
                distribution[decision.choice] = 0;
            }
            distribution[decision.choice]++;
            return distribution;
        },{});
        return child;
    });
    return root;
};

const printDecisionTree = (decisionTree, depth) => {
    depth = depth ? depth : 0;
    if (depth === 0){
        logger.startWriting();
    }
    let spacing = "";
    for (let i = 0; i < depth; i++){
        spacing = spacing + "    ";
    }
    logger.addLine(spacing+" "+decisionTree.question);
    decisionTree.children.map(child => {
        const distributionText = child.distribution ? JSON.stringify(child.distribution) : "";
        logger.addLine(spacing+"  - "+child.chosenAnswer+" "+distributionText)
        if (child.nextQuestion){
            printDecisionTree(child.nextQuestion, depth+1)
        }
    });
    if (depth === 0){
        logger.endWriting();
    }
};

module.exports = {informationGain,buildDecisionTree, printDecisionTree};