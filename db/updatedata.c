#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <string.h>
#include "constantfilenames.h"

#define DEFAULT_ERROR_MESSAGE_LENGTH 9

int errorCheckedOpen(char* filename, int accessMode, int permissions);
void* errorCheckedMalloc(int size);
void fatalError(char* errorMessage);
int readLine(int fd, char* buffer, int bufferSize);
void decomposeString(char* stringToDecompose);

/*
   * Updates armor data of units by reading through the armor.ini file at a predetermined location
   * @return int - returns 0 if the function executes successfully, otherwise it will print an error message and exit the program
*/
int updateArmor() {
    int armorFileIniDescriptor; 
    int armorDataJsonDescriptor;

    int maxLines = 10000;
    int validArmorDataHeader = 0; // Variable to make sure we are not reading commented/invalid data for armor, prevents malformed data

    char armorFileDelimiters[6] = {'\t', ' ', '\n', '=',';'};
    char* armorFileLine = (char*)errorCheckedMalloc(512);
    char* armorDataJsonLine = (char*)errorCheckedMalloc(512);
    char* token;

    armorFileIniDescriptor = errorCheckedOpen(ARMORFILE, O_RDONLY, S_IRUSR);
    armorDataJsonDescriptor = errorCheckedOpen("./updatedArmor.json", O_WRONLY | O_CREAT, S_IWUSR);
    lseek(armorFileIniDescriptor, 436, SEEK_SET); // 436 Bytes is the offset for the armor data within the file before the formatting becomes consistent.
    write(armorDataJsonDescriptor, "[\n", 2); // Write an opening square bracket to the json file to start the array of armor data

    while(readLine(armorFileIniDescriptor, armorFileLine, 512) > 0 && maxLines > 0) {
        armorDataJsonLine[0] = '\0';
        char startOfArmorFileLine = armorFileLine[0];
        if(startOfArmorFileLine == ' ') {
            if(validArmorDataHeader == 0) {
                continue;
            }
            int endedInNewline = 1;
            strncat(armorDataJsonLine, "    \"", 6);
            token = strtok(armorFileLine, armorFileDelimiters);
            if(strcmp(token, "Armor") == 0) {
                token = strtok(NULL, armorFileDelimiters);
            }
            strncat(armorDataJsonLine, token, strlen(token));
            strncat(armorDataJsonLine, "\": ", 4);
            token = strtok(NULL, armorFileDelimiters); 
            strncat(armorDataJsonLine, "\"", 2);
            if(token[strlen(token)-1] == 13) {
                endedInNewline = 1;
            } else {
                endedInNewline = 0;
            }
            strncat(armorDataJsonLine, token, strlen(token)-endedInNewline);
            strncat(armorDataJsonLine, "\",\n", 4);
        }
        else if(startOfArmorFileLine == 'A') {
            validArmorDataHeader = 1;
            strncat(armorDataJsonLine,"  {\n    ", 6); 
            strncat(armorDataJsonLine,"  \"name\": ", 11);
            token = strtok(armorFileLine, armorFileDelimiters);
            token = strtok(NULL, armorFileDelimiters);
            strncat(armorDataJsonLine, "\"", 2);
            strncat(armorDataJsonLine, token, strlen(token)-1);
            strncat(armorDataJsonLine, "\",\n", 4);
        }
        else if(startOfArmorFileLine == 'E') {
            validArmorDataHeader = 0;
            lseek(armorDataJsonDescriptor, -2, SEEK_CUR);
            strncat(armorDataJsonLine, "\n  },\n", 7);
        }
        else {
            validArmorDataHeader = 0;
        }
        write(armorDataJsonDescriptor, armorDataJsonLine, strlen(armorDataJsonLine)); // Write the read line to the json file
        maxLines--;
    }

    lseek(armorDataJsonDescriptor, -2, SEEK_CUR); // Remove the last comma and newline from the last armor data entry
    write(armorDataJsonDescriptor,"\n]", 2); // Write a closing square bracket to the json file to end the array of armor data
    close(armorFileIniDescriptor);
    close(armorDataJsonDescriptor);
    free(armorFileLine);
    return 0;
}

int updateArmorDatabase() {
    return 0;
}
/*
    * Utility function that reads one line at a time from a file based on the file descriptor and returns the size that was read.
    * @param int fd - the file descriptor of the file to read from
    * @param char* buffer - the buffer to store the read line
    * @param int bufferSize - the size of the buffer
    * @return int - the number of bytes read from the file, or -1 if an error occurs during reading
*/
int readLine(int fd, char* buffer, int bufferSize) {
    int bytesRead = 0;
    char c;
    while(bytesRead < bufferSize - 1 && read(fd, &c, 1) > 0) {
        buffer[bytesRead++] = c;
        if(c == '\n') {
            break;
        }
    }
    buffer[bytesRead] = '\0'; // Null-terminate the string
    return bytesRead;
}

/* 
    * Utitlity function for error checking and opening a file. If the file fails to open, it will print an error message and exit the program
    * @param char* filename - the name of the file
    * @param int accessMode - the access mode for opening the file
    * @param int permissions - the permissions to use when creating a new file (only used if O_CREAT is specified in accessMode)
    * @return int - the file descriptor of the opened file
*/
int errorCheckedOpen(char* filename, int accessMode, int permissions) {
    int fd = open(filename, accessMode, permissions);
    if (fd == -1) {
        char* errorMessage = (char*)errorCheckedMalloc(22 + strlen(filename));
        fatalError(strncat(strncat(errorMessage, "Failed to open file: ", 22), filename, strlen(filename)));
    } else {
        return fd;
    }
}
/*
    * Utility function for error checking and allocation of memory. If the allocaiton fails, an error message will be printed to stderr and the program will exit
    * @param int size - the size of memory to allocate
    * @return void* - a pointer to the allocated memory
*/
void* errorCheckedMalloc(int size) {
    void* ptr = malloc(size);
    if (ptr == NULL) {
        fatalError("[ERROR] Failed to allocate memory");
    } else {
        return ptr;
    }
}

/*
    * Utility function for printing an error message to stderr and exiting the program
    * @param char* errorMessage - the error message to print
    * @return void - this function does not return anything, it will exit the program
*/
void fatalError(char* messageFromFunction) {
    char* errorMessage = (char*)errorCheckedMalloc(128);
    strcpy(errorMessage, "[ERROR] ");
    strncat(errorMessage, messageFromFunction, 128 - DEFAULT_ERROR_MESSAGE_LENGTH);
    fprintf(stderr, "%s\n", errorMessage);
    exit(1);
}

/*
    * Utility function for decomposing a string into characters to see what ASCII characters are present in the string and display them by their integer value instead of their character
    * @param char* stringToDecompose - the string to be decomposed
    * @return void - prints the decomposed string to the console and returns nothing
*/
void decomposeString(char* stringToDecompose) {
    for(int i = 0; stringToDecompose[i] != '\0'; i++) {
        printf("%d ", (int)stringToDecompose[i]);
    }
    printf("\n");
}

int main() {
    printf("[INFO] Starting armor data update\n");
    updateArmor();
    printf("[INFO] Updating armor database\n");
    updateArmorDatabase();
}