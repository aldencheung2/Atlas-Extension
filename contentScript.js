//Creates loading logo
let loadingContainer = document.createElement("div");
loadingContainer.id = "loadingSymbol";

let loadingSymbol = document.createElement("img");
loadingSymbol.src = "/static/images/icons/rolling.gif";
loadingSymbol.alt = "Loading..";
loadingSymbol.width = "75";
loadingSymbol.height = "75";

//Adds loading logo to page
loadingContainer.appendChild(loadingSymbol);
document.body.appendChild(loadingContainer);

//Determining the course based on the URL
const url = location.toString();
var courseCode = url.substring(url.indexOf("course/")+7, url.length -1);
const department = courseCode.split("%20")[0];
const courseNumber = courseCode.split("%20")[1];

//Creates button to check syllabus
const syllabus = "https://webapps.lsa.umich.edu/syllabi/cg_syllabus_results.aspx?Subject="+department+"&CatNbr="+courseNumber;
var syllabusDiv = document.createElement("div");
let imgURL = chrome.runtime.getURL("magnifying-glass.png");
syllabusDiv.innerHTML = "<a href=" + syllabus + " target=\"_blank\" rel=\"noopener noreferrer\"><img src=" + imgURL + "></a>";
let syllabusText = document.createElement("p");
syllabusText.innerHTML = "Search for Past Syllabi";
syllabusText.className = "bold bookmark-save-text";
document.querySelector("div[class=\"bookmark-container\"]").appendChild(syllabusDiv);
document.querySelector("div[class=\"bookmark-container\"]").appendChild(syllabusText);

//Gets section data from Atlas API
try{
    //Fetch data
    var sectionFetcher = async courseCode => {
        let sectionData = await fetch("https://atlas.ai.umich.edu/api/section-table-data/" + courseCode);
        console.log("https://atlas.ai.umich.edu/api/section-table-data/" + courseCode);
        sectionData = await sectionData.json();
        return sectionData;
    }
    //Parse data
    sectionFetcher(courseCode).then(sectionData => {
        
        var semesterObject = {};
        console.log(sectionData);
        console.log(sectionData.terms);
        for(let i = 0; i<sectionData.terms.length; i++){
            semesterObject[sectionData.terms[i].TermShortDescr] = sectionData.terms[i].TermCode;
        }
        console.log(semesterObject);
        
        CGsearcher(department, courseNumber, semesterObject);
    });
    
} catch(error){
    console.warn(error);
}


//Converts the date format of the semester from Atlas' format to LSA CG's format
function termFormat(termDescr, code){
    let season = termDescr.split(" ")[0]
    if (season == "FA"){
        season = "f_" + termDescr.split(" ")[1].substring(2,3) + "_" + code;
    } else if (season == "WN"){
        season = "w_" + termDescr.split(" ")[1].substring(2,3) + "_" + code;
    } else {
        season = season.toLowerCase() + "_" + termDescr.split(" ")[1].substring(2,3) + "_" + code;
    }
    return season;
}

//Defines Instructor class
class Instructor{
    constructor(name, wta, difficulty, rating, link, reviewCount){
        this.name = name;
        //Ratemyprof would take again rating
        this.wta = wta;
        this.difficulty = difficulty;
        this.rating = rating;
        this.rmpLink = link;
        this.numOfRatings = reviewCount;
    }
}

//Adds course description and distribution requirements from LSA CG
async function CGsearcher(courseDep, courseNum, semesterObj){
    var searchUrl = "https://www.lsa.umich.edu/cg/cg_results.aspx?";
    Object.keys(semesterObj).forEach((semester)=>searchUrl+="termArray="+termFormat(semester, semesterObj[semester])+"&");
    searchUrl+="cgtype=ug&cgtype=gr&show=20&department="+courseDep+"&catalog="+courseNum;
    console.log(searchUrl);

    chrome.runtime.sendMessage(
        {link: searchUrl},
        results => {
            //Adds subject description
            let parser = new DOMParser();
            let resultsHTML = parser.parseFromString(results, 'text/html');
            let subjectDiv = document.createElement("div");
            subjectDiv.innerHTML ="<p><b>"+courseDep+" Department Information</b></p>"+resultsHTML.getElementsByClassName("col-md-12 dptnotesreset")[0].innerHTML;
            document.getElementsByClassName("show-more-container")[0].appendChild(subjectDiv);

            //Adds course distribution info
            let reqDiv = document.createElement("div");
            reqDiv.innerHTML = "<p class=\"grade-median text-small bold\">"+resultsHTML.getElementById("contentMain_rptrRsltsMain_Panel3_0").innerHTML+"</p>";
            document.getElementById("credits").parentNode.insertBefore(reqDiv, document.getElementById("credits").nextSibling);
    
    });

    let instructorList = {};

    //Iterates through every semester and looks for lecture sections. If it is a lecture section, it adds the section and the corresponding instructor to instructorList
    //This was needed as Atlas often has instructors for sections listed as N/A even though LSA CG has the correct instructor listed
    for(semester=0; semester<Object.keys(semesterObj).length; semester++){
        let semesterNumber = semesterObj[Object.keys(semesterObj)[semester]];
        await sectionFetcher(courseDep+"%20"+courseNum+"/"+semesterObj[Object.keys(semesterObj)[semester]])
            .then(sectionData => {
                let lastLecture = -1;
                //Finds the last lecture
                if(semester == Object.keys(semesterObj).length-1){
                    for(let i = 0; i<sectionData.sections.length; i++){
                        if(sectionData.sections[i].SectionType == "LEC"){
                            lastLecture = sectionData.sections[i].SectionNumber;
                        }
                    }
                
                    console.log(lastLecture);
                }
                //Iterate through every section in the semester
                for(let i = 0; i<sectionData.sections.length; i++){
                    if(sectionData.sections[i].SectionType == "LEC"){
                        console.log("current section number: " + sectionData.sections[i].SectionNumber);
                        //Fetches LSA CG page if section is a lecture
                        chrome.runtime.sendMessage(
                            {link: "https://www.lsa.umich.edu/cg/cg_detail.aspx?content="+semesterNumber+courseDep+courseNum+sectionData.sections[i].SectionNumber},
                            results => {
                                //Checks if LSA CG has instructor listed and adds the instructor to instructorList if so
                                if(results.includes("Primary Instructor")){
                                    let parser = new DOMParser();
                                    let resultsHTML = parser.parseFromString(results, 'text/html');
                                    let classDetails = resultsHTML.getElementsByClassName("panel-body")[0].getElementsByTagName("div");
                                    for(let divNumber = 0; divNumber<classDetails.length; divNumber++){
                                        if(classDetails[divNumber].innerText.includes("Primary Instructor")){
                                            let instructorName = classDetails[divNumber+1].innerText.trim();
                                            instructorName = instructorName.split(",")[1] + " " + instructorName.split(",")[0];
                                            // Gets rid of middle name if applicable (helps with searching on rate
                                            // my prof)
                                            console.log("checking"+instructorName);
                                            if(instructorName.trim().split(" ").length == 3){
                                                console.log("middlename found");
                                                instructorName = instructorName.split(" ")[0] + " " + instructorName.split(" ")[2] ;
                                            }
                                            instructorList[sectionData.sections[i].ClassNumber] = instructorName.trim();
                                        }
                                    }
                                }
                                console.log("semester: " + semester + " Object.keys(semesterObj).length-1: "+ (Object.keys(semesterObj).length-1));
                                console.log("i: "+i+" sectionData.sections.length-1: " + (sectionData.sections.length-1));
                                //Waits until all lecture sections have been checked
                                if(sectionData.sections[i].SectionNumber == lastLecture){
                                    console.log("leaving CGsearcher");
                                    window.globalInstructorList = instructorList;
            
                                    console.log("semester="+semester.toString()+"and Object.keys(semesterObj).length-1="+(Object.keys(semesterObj).length-1).toString());
                                    
                                    //Waits for the course section table to load before running instructorChecker
                                    
                                    let dropdown = document.querySelector("div[class=\"section-dropdown-container\"]>select");
                                    
                                    //Checks if the course section table has loaded by seeing if the dropdown
                                    //menu has appeared
                                    if(dropdown){
                                        rateMyProf(instructorList)
                                    }
                                    //If it's not loaded, wait until it's loaded
                                    else{
                                        //Creates a mutatation observer that checks when the section table has loaded
                                        let tableObserver = new MutationObserver(function (mutations, me) {
                                            if (dropdown) {
                                                //Ends observation
                                                me.disconnect();
                                                rateMyProf(instructorList);
                                            }
                                        });
                                            
                                        //Start observing page
                                        tableObserver.observe(document, {
                                            childList: true,
                                            subtree: true
                                        });
                                    }
                                }
                            }
                        );
                    }
                }
                //This is to handle the case where the last semester has no lecture sections
                if(semester == Object.keys(semesterObj).length-1 && sectionData.sections.length == 0){
                    console.log("leaving CGsearcher");
                    window.globalInstructorList = instructorList;

                    console.log("semester="+semester.toString()+"and Object.keys(semesterObj).length-1="+(Object.keys(semesterObj).length-1).toString());
                    
                    //Waits for the course section table to load before running instructorChecker
                    
                    let dropdown = document.querySelector("div[class=\"section-dropdown-container\"]>select");
                    
                    //Checks if the course section table has loaded by seeing if the dropdown
                    //menu has appeared
                    if(dropdown){
                        rateMyProf(instructorList)
                    }
                    //If it's not loaded, wait until it's loaded
                    else{
                        //Creates a mutatation observer that checks when the section table has loaded
                        let tableObserver = new MutationObserver(function (mutations, me) {
                            if (dropdown) {
                                //Ends observation
                                me.disconnect();
                                rateMyProf(instructorList);
                            }
                        });
                            
                        //Start observing page
                        tableObserver.observe(document, {
                            childList: true,
                            subtree: true
                        });
                    }
                }
                
                return instructorList;
            })
    }
}

//Adds RateMyProf table headers (rating, would take again, etc.)
function headerCreator(){
    let ratingHeader = document.createElement("th");
    ratingHeader.innerHTML = "<span title = 'Out of a maximum of 5'>Rating</span>";
    let wtaHeader = document.createElement("th");
    wtaHeader.innerHTML = "<span title = 'Would Take Again'>WTA</span>";
    let difficultyHeader = document.createElement("th");
    difficultyHeader.innerHTML = "<span title = 'Out of a maximum of 5'>Difficulty</span>";
    document.getElementsByClassName("course-section-table")[0].getElementsByClassName("text-small")[0].rows[0].append(ratingHeader, wtaHeader, difficultyHeader);
}

//Adds information to the section table
function instructorChecker(instructorList){
    try{
        console.log(instructorList);
        
        let sectionTable = document.getElementsByClassName("course-section-table")[0].getElementsByClassName("text-xsmall")[0];
        console.log("sectionTable found");
        
        let rmpRating, wtaRating, diffRating;
    
        //Makes sure sections are being offered during the selected term
        if(document.getElementsByClassName("text-small bold blue-highlight-text text-center").length == 0){
            //Iterates through each section
            for(let i = 0, tableRow; tableRow = sectionTable.rows[i]; i++){
                //Checks if the section is in instructorList
                if(tableRow.cells[1].innerHTML in instructorList){
                    //If instructor is listed as N/A, it fills in the actual instructor from LSA CG if possible
                    if(tableRow.cells[5].innerHTML == "N/A"){
                        document.getElementsByClassName("course-section-table")[0].getElementsByClassName("text-xsmall")[0].rows[i].cells[5].innerHTML = "<a href = '" + instructorList[tableRow.cells[1].innerHTML].rmpLink + "'>" + instructorList[tableRow.cells[1].innerHTML].name + "</a>";
                    }
                    //Adds RateMyProf rating
                    rmpRating = document.createElement("td");
                    rmpRating.innerHTML = "<span title = '" + instructorList[tableRow.cells[1].innerHTML].numOfRatings + "'>" + instructorList[tableRow.cells[1].innerHTML].rating + "</span>";
                    
                    //Adds would take again rating
                    wtaRating = document.createElement("td");
                    wtaRating.innerHTML = "<span title = '" + instructorList[tableRow.cells[1].innerHTML].numOfRatings + "'>" + instructorList[tableRow.cells[1].innerHTML].wta + "</span>";
                    
                    //Adds difficulty rating
                    diffRating = document.createElement("td");
                    diffRating.innerHTML = "<span title = '" + instructorList[tableRow.cells[1].innerHTML].numOfRatings + "'>" + instructorList[tableRow.cells[1].innerHTML].difficulty + "</span>";
                }
                else{
                    //Adds RateMyProf rating
                    rmpRating = document.createElement("td");
                    rmpRating.innerHTML = "N/A";
                    
                    //Adds would take again rating
                    wtaRating = document.createElement("td");
                    wtaRating.innerHTML = "N/A";
                    
                    //Adds difficulty rating
                    diffRating = document.createElement("td");
                    diffRating.innerHTML = "N/A";
                }

                //Adds the ratings to the page
                document.getElementsByClassName("course-section-table")[0].getElementsByClassName("text-xsmall")[0].rows[i].append(rmpRating, wtaRating, diffRating);
            }
        }
    } catch(error){
        console.error(error);
    }

    //Calls expandChecker if the table is expanded
    for(let i=0; i<document.getElementsByClassName("expand-btn").length; i++){
        document.getElementsByClassName("expand-btn")[i].onclick = expandChecker;
    }

    window.instructorList = instructorList;

    //Removes loading logo
    document.getElementById("loadingSymbol").parentNode.removeChild(document.getElementById("loadingSymbol"));

    console.log("exiting instructorChecker");
}

//Corrects formatting if table is expanded
function expandChecker(){
    //await new Promise(resolve => setTimeout(resolve, 300)); // waits 0.3s
    let instructorList = window.instructorList;
    let sectionTable = document.getElementsByClassName("course-section-table")[0].getElementsByClassName("text-xsmall")[0];
    //Iterates through every row
    for(let i = 0, tableRow; tableRow = sectionTable.rows[i]; i++){
        //Checks if the row is a lecture/lab
        if(tableRow.cells[0].className == "blue-highlight-text"){

            //Checks for a section description
            if(tableRow.cells[0].getElementsByClassName("expand-btn")[0].innerHTML == "-"){
                console.log("Section description found")
                //Gets rid of ratings so that they don't appear in section description
                try{
                    sectionTable.rows[i+1].deleteCell(1);
                    sectionTable.rows[i+1].deleteCell(1);
                    sectionTable.rows[i+1].deleteCell(1);
                } catch(error){
                    console.log(error);
                }
            }
            
            

            //Checks if new columns need to be made
            if(tableRow.cells.length != 13){
            //Checks if the section is in instructorList
                if(tableRow.cells[1].innerHTML in instructorList){
                    //If instructor is listed as N/A, it fills in the actual instructor from LSA CG if possible
                    if(tableRow.cells[5].innerHTML == "N/A"){
                        document.getElementsByClassName("course-section-table")[0].getElementsByClassName("text-xsmall")[0].rows[i].cells[5].innerHTML = "<a href = '" + instructorList[tableRow.cells[1].innerHTML].rmpLink + "'>" + instructorList[tableRow.cells[1].innerHTML].name + "</a>";
                    }
                    //Adds RateMyProf rating
                    rmpRating = document.createElement("td");
                    rmpRating.innerHTML = "<span title = '" + instructorList[tableRow.cells[1].innerHTML].numOfRatings + "'>" + instructorList[tableRow.cells[1].innerHTML].rating + "</span>";
                    
                    //Adds would take again rating
                    wtaRating = document.createElement("td");
                    wtaRating.innerHTML = "<span title = '" + instructorList[tableRow.cells[1].innerHTML].numOfRatings + "'>" + instructorList[tableRow.cells[1].innerHTML].wta + "</span>";
                    
                    //Adds difficulty rating
                    diffRating = document.createElement("td");
                    diffRating.innerHTML = "<span title = '" + instructorList[tableRow.cells[1].innerHTML].numOfRatings + "'>" + instructorList[tableRow.cells[1].innerHTML].difficulty + "</span>";
                }
                else{
                    //Adds RateMyProf rating
                    rmpRating = document.createElement("td");
                    rmpRating.innerHTML = "N/A";
                    
                    //Adds would take again rating
                    wtaRating = document.createElement("td");
                    wtaRating.innerHTML = "N/A";
                    
                    //Adds difficulty rating
                    diffRating = document.createElement("td");
                    diffRating.innerHTML = "N/A";
                }

                //Adds the ratings to the page
                document.getElementsByClassName("course-section-table")[0].getElementsByClassName("text-xsmall")[0].rows[i].append(rmpRating, wtaRating, diffRating);
                
            }

        }
    }
}



//Waits for the table of course sections to finish loading, then calls instructorChecker
function dropdownChange(){
    console.log("change detected");

    let loading = document.querySelector("div[class=\"loading-gif\"]");

    let pageChanges = 0;
                        
    //Checks if the page has already begun loading by looking for the loading symbol
    if(loading){
        console.log("already begun loading");
        //Creates a mutatation observer that checks when the section table has finished loading
        let loadingObserver = new MutationObserver(function (mutations, observer) {
            console.log("loaded");
            //Ends observation
            observer.disconnect();
            //If it has loaded, call instructorChecker to update the table with the correct instructors
            instructorChecker(window.globalInstructorList);
            dropdownMonitor();
            return;
        });
            
        //Start observing page
        loadingObserver.observe(document, {
            childList: true,
            subtree: true
        });
    }
    //If the page has not begun loading, wait until the page changes twice (the first change is to
    //start loading, the second change is to finish loading)
    else{
        console.log("has not begun loading");
        //Creates a mutatation observer that checks for when the loading sign appears
        let loadingObserver = new MutationObserver(function(mutations, observer){
            console.log("page change");
            console.log(mutations);
            startedLoading = false;
            for(const mutation of mutations){
                if(mutation.addedNodes.length == 1){
                    if(mutation.addedNodes[0].alt == "Loading.."){
                        observer.disconnect();
                        console.log("started loading");
                        startedLoading = true;
                        break
                    }
                }
            }
            if(startedLoading){
                let loadedObserver = new MutationObserver(function(mutations, observer){
                    for(const mutation of mutations){
                        if(mutation.removedNodes.length == 1){
                            if(mutation.removedNodes[0].alt == "Loading.."){
                                console.log("finished loading");
                                observer.disconnect();
                                //If it has loaded, call instructorChecker to update the table with the correct instructors
                                instructorChecker(window.globalInstructorList);
                                dropdownMonitor();
                            }
                        }
                    }
                });

                loadedObserver.observe(document, {
                    childList: true,
                    subtree: true
                });
            }
        });
            
        //Start observing page
        loadingObserver.observe(document, {
            childList: true,
            subtree: true
        });
        console.log("else exit");
    }

    console.log("exiting dropdownValue");
}


function dropdownMonitor(){
    console.log("waiting for changes");
    document.querySelector("div[class=\"section-dropdown-container\"]>select").onchange = dropdownChange;
    console.log("exiting dropdownMonitor");
}

//Finds ratemyprof ratings for each prof
function rateMyProf(instructorList){
    console.log(Object.keys(instructorList).length-1);

    //Keeps track of which instructors have had their ratemyprof pages fetched
    let fetchedInstructors = {};

    //Sets every instructor's rmp page status to not fetched
    for(let i=0; i<Object.keys(instructorList).length; i++){
        fetchedInstructors[Object.keys(instructorList)[i]] = 0;
    }

    for(let i=0; i<Object.keys(instructorList).length; i++){
        console.log(i);    

        let rmpUrl = "https://www.ratemyprofessors.com/search/teachers?query=" + instructorList[Object.keys(instructorList)[i]].split(" ")[0] + "%20" + instructorList[Object.keys(instructorList)[i]].split(" ")[1] + "&sid=U2Nob29sLTEyNTg=";

        chrome.runtime.sendMessage(
            {link: rmpUrl},
            (results) => {
                //Adds subject description
                let parser = new DOMParser();
                let resultsHTML = parser.parseFromString(results, 'text/html');
                console.log(rmpUrl);
                let wta, difficulty, rating, link, reviewCount;
                wta = difficulty = rating = "N/A";
                reviewCount = "0 ratings";
                //Checks if there are any search results
                if (resultsHTML.getElementsByClassName("TeacherCard__StyledTeacherCard-syjs0d-0 dLJIlx").length != 0){
                    //Would take again rating
                    wta = resultsHTML.getElementsByClassName("CardFeedback__CardFeedbackNumber-lq6nix-2 hroXqf")[0].innerText;
                    console.log("would take again: " + wta);
                    difficulty = resultsHTML.getElementsByClassName("CardFeedback__CardFeedbackNumber-lq6nix-2 hroXqf")[1].innerText;
                    console.log("level of difficulty: " + difficulty);
                    //If their rating is good
                    if(resultsHTML.getElementsByClassName("CardNumRating__CardNumRatingNumber-sc-17t4b9u-2 kMhQxZ").length != 0){
                        console.log("high")
                        rating = resultsHTML.getElementsByClassName("CardNumRating__CardNumRatingNumber-sc-17t4b9u-2 kMhQxZ")[0].innerText;
                    }
                    //If their rating is ok
                    else if(resultsHTML.getElementsByClassName("CardNumRating__CardNumRatingNumber-sc-17t4b9u-2 fJKuZx").length != 0){
                        console.log("med")
                        rating = resultsHTML.getElementsByClassName("CardNumRating__CardNumRatingNumber-sc-17t4b9u-2 fJKuZx")[0].innerText;
                    }
                    //If their rating is bad
                    else if(resultsHTML.getElementsByClassName("CardNumRating__CardNumRatingNumber-sc-17t4b9u-2 bUneqk").length != 0){
                        rating = resultsHTML.getElementsByClassName("CardNumRating__CardNumRatingNumber-sc-17t4b9u-2 bUneqk")[0].innerText;
                    }
                    console.log("rating: " + rating);

                    //Link to the prof's reviews
                    link = "https://www.ratemyprofessors.com" + resultsHTML.getElementsByClassName("TeacherCard__StyledTeacherCard-syjs0d-0 dLJIlx")[0].href.replace("https://atlas.ai.umich.edu","");

                    //Number of reviews
                    reviewCount = resultsHTML.getElementsByClassName("CardNumRating__CardNumRatingCount-sc-17t4b9u-3 jMRwbg")[0].innerText
                }

                let currentInstructor = new Instructor(instructorList[Object.keys(instructorList)[i]], wta, difficulty, rating, link, reviewCount);
                instructorList[Object.keys(instructorList)[i]] = currentInstructor;
                console.log("i: " + i + " length-1= " + (Object.keys(instructorList).length - 1));
                console.log(instructorList);

                //Updates instructor's rmp page status to fetched
                fetchedInstructors[Object.keys(instructorList)[i]] = 1;

                //Checks if all prof ratings have been found
                let allFetched = true;
                for(let i=0; i<Object.keys(instructorList).length; i++){
                    if(fetchedInstructors[Object.keys(instructorList)[i]] != 1){
                        allFetched = false;
                    }
                }
                //Call instructorChecker and headerCreator after all prof ratings are found to display the
                //ratings
                if(allFetched){
                    console.log("rateMyProf fetching complete");
                    headerCreator();
                    instructorChecker(instructorList);
                    //Waits for the user to select a different semester
                    dropdownMonitor();
                }
            }
        );
        console.log("complete");
    }

}